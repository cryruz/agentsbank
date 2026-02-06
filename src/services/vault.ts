// Supabase Vault Integration for AgentsBank.ai
// Complete solution for secure private key management and transaction signing

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Store encrypted private key in Supabase Vault
 * Called during wallet creation
 */
export async function storePrivateKeyInVault(
  walletId: string,
  privateKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Supabase Vault automatically encrypts with AES-256
    const { data, error } = await supabase.functions.invoke('vault-store-secret', {
      body: {
        secret_name: `wallet_${walletId}_key`,
        secret_value: privateKey,
      },
    })

    if (error) {
      console.error('Failed to store in Vault:', error)
      return { success: false, error: error.message }
    }

    console.log(`✓ Private key stored in Vault for wallet ${walletId}`)
    return { success: true }
  } catch (err: any) {
    console.error('Vault storage error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Retrieve encrypted private key from Vault
 * Only called inside secure Edge Functions
 */
export async function retrievePrivateKeyFromVault(
  walletId: string
): Promise<string> {
  try {
    // This runs server-side in Edge Function
    const { data, error } = await supabase.functions.invoke('vault-retrieve-secret', {
      body: {
        secret_name: `wallet_${walletId}_key`,
      },
    })

    if (error || !data?.secret_value) {
      throw new Error('Failed to retrieve private key from Vault')
    }

    return data.secret_value
  } catch (err: any) {
    console.error('Vault retrieval error:', err)
    throw err
  }
}

/**
 * Rotate private key (security best practice)
 * Generates new key and updates Vault
 */
export async function rotatePrivateKey(
  walletId: string,
  newPrivateKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('vault-rotate-secret', {
      body: {
        secret_name: `wallet_${walletId}_key`,
        new_value: newPrivateKey,
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    console.log(`✓ Private key rotated for wallet ${walletId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Delete private key from Vault (when wallet is deleted)
 */
export async function deletePrivateKeyFromVault(
  walletId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('vault-delete-secret', {
      body: {
        secret_name: `wallet_${walletId}_key`,
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    console.log(`✓ Private key deleted from Vault for wallet ${walletId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Sign and broadcast transaction (complete pipeline)
 * This is called from the SDK
 */
export async function executeTransaction(
  walletId: string,
  toAddress: string,
  amount: string,
  currency: string,
  chain: string
): Promise<{
  tx_id: string
  tx_hash: string
  status: string
}> {
  try {
    // 1. Create transaction record (status: pending)
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: walletId,
        type: 'transfer',
        amount,
        currency,
        from_address: '', // Will be filled after signing
        to_address: toAddress,
        status: 'pending',
        metadata: { initiated_at: new Date().toISOString() },
      })
      .select()
      .single()

    if (txError || !tx) {
      throw new Error('Failed to create transaction record')
    }

    // 2. Call Edge Function to sign transaction
    const signResponse = await supabase.functions.invoke('sign-and-broadcast-transaction', {
      body: {
        tx_id: tx.tx_id,
        wallet_id: walletId,
        to_address: toAddress,
        amount,
        currency,
        chain,
      },
    })

    if (signResponse.error) {
      // Update transaction status to failed
      await supabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('tx_id', tx.tx_id)

      throw new Error(signResponse.error.message)
    }

    const { tx_hash } = signResponse.data

    // 3. Start polling for confirmation
    pollForConfirmation(tx.tx_id, chain, tx_hash)

    return {
      tx_id: tx.tx_id,
      tx_hash,
      status: 'pending',
    }
  } catch (err: any) {
    console.error('Transaction execution error:', err)
    throw err
  }
}

/**
 * Poll blockchain for transaction confirmation
 */
async function pollForConfirmation(
  txId: string,
  chain: string,
  txHash: string,
  maxAttempts = 120,
  delayMs = 10000
): Promise<void> {
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      // Call Edge Function to check status
      const statusResponse = await supabase.functions.invoke('poll-transaction-status', {
        body: {
          tx_id: txId,
          chain,
          tx_hash: txHash,
        },
      })

      if (statusResponse.error) {
        console.error('Error polling status:', statusResponse.error)
        attempts++
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }

      const { status, confirmations } = statusResponse.data

      if (status === 'confirmed') {
        // Update transaction record
        await supabase
          .from('transactions')
          .update({
            status: 'confirmed',
            metadata: {
              confirmed_at: new Date().toISOString(),
              confirmations,
            },
          })
          .eq('tx_id', txId)

        console.log(`✓ Transaction confirmed: ${txHash}`)
        return
      } else if (status === 'failed') {
        // Update transaction record
        await supabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('tx_id', txId)

        console.error(`✗ Transaction failed: ${txHash}`)
        return
      }

      attempts++
      console.log(`Polling transaction ${txHash}: attempt ${attempts}/${maxAttempts}`)
      await new Promise((r) => setTimeout(r, delayMs))
    } catch (err) {
      console.error('Error in polling loop:', err)
      attempts++
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  console.warn(`Transaction polling timeout: ${txHash}`)
}
