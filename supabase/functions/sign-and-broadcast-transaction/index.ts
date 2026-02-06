// Supabase Edge Function: Sign & Broadcast Transaction
// Path: supabase/functions/sign-and-broadcast-transaction/index.ts
// Complete pipeline: retrieve key from Vault → sign → broadcast

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'npm:ethers@6'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: Deno.env.get('ETH_RPC_URL') || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  bsc: Deno.env.get('BNB_RPC_URL') || 'https://bsc-dataseed.bnbchain.org',
}

const TOKEN_CONTRACTS: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0x0',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  bsc: {
    BNB: '0x0',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83FE1Ad97B32Cd580d',
  },
}

const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  BNB: 18,
  USDT: 6,
  USDC: 6,
}

interface SignAndBroadcastRequest {
  tx_id: string
  wallet_id: string
  to_address: string
  amount: string
  currency: string
  chain: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body: SignAndBroadcastRequest = await req.json()
    const { tx_id, wallet_id, to_address, amount, currency, chain } = body

    // 1. Get wallet details
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('agent_id, address, private_key_hash')
      .eq('wallet_id', wallet_id)
      .single()

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Retrieve private key from Vault
    const vaultResponse = await supabase.functions.invoke('vault-get-secret', {
      body: {
        secret_name: `wallet_${wallet_id}_private_key`,
      },
    })

    if (vaultResponse.error || !vaultResponse.data?.secret_value) {
      console.error('Vault retrieval failed:', vaultResponse.error)
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve private key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const privateKey = vaultResponse.data.secret_value

    // 3. Build transaction
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain])
    const signer = new ethers.Wallet(privateKey, provider)

    const nonce = await provider.getTransactionCount(signer.address)
    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei')

    let txData: any
    const tokenAddress = TOKEN_CONTRACTS[chain]?.[currency]

    if (tokenAddress === '0x0' || !tokenAddress) {
      // Native transfer (ETH, BNB)
      txData = {
        to: to_address,
        value: ethers.parseEther(amount),
        gasLimit: 21000,
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: chain === 'ethereum' ? 1 : 56,
      }
    } else {
      // ERC-20 token transfer
      const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)']
      const iface = new ethers.Interface(erc20Abi)
      const decimals = TOKEN_DECIMALS[currency] || 18
      const amountBigInt = ethers.parseUnits(amount, decimals)
      const data = iface.encodeFunctionData('transfer', [to_address, amountBigInt])

      const gasEstimate = await provider.estimateGas({
        from: signer.address,
        to: tokenAddress,
        data: data,
        value: '0',
      })

      txData = {
        to: tokenAddress,
        data: data,
        value: '0',
        gasLimit: (gasEstimate * BigInt(120)) / BigInt(100),
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: chain === 'ethereum' ? 1 : 56,
      }
    }

    // 4. Sign transaction
    const signedTx = await signer.signTransaction(txData)

    console.log(`✓ Transaction signed for ${wallet.address}`)

    // 5. Broadcast transaction
    const txResponse = await provider.broadcastTransaction(signedTx)
    const txHash = txResponse.hash

    console.log(`✓ Transaction broadcasted: ${txHash}`)

    // 6. Update transaction record in database
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        tx_hash: txHash,
        from_address: signer.address,
        status: 'pending',
        metadata: {
          signed_at: new Date().toISOString(),
          gas_price: ethers.formatUnits(txData.gasPrice, 'gwei'),
          nonce: txData.nonce,
        },
      })
      .eq('tx_id', tx_id)

    if (updateError) {
      console.error('Failed to update transaction record:', updateError)
    }

    // 7. Log action in audit logs
    await supabase.from('audit_logs').insert({
      entity_type: 'transaction',
      entity_id: tx_id,
      action: 'transaction_signed_and_broadcast',
      actor: wallet.agent_id,
      actor_type: 'agent',
      details: {
        chain,
        to_address,
        amount,
        currency,
        tx_hash: txHash,
      },
    })

    return new Response(
      JSON.stringify({
        tx_id,
        tx_hash: txHash,
        status: 'pending',
        from_address: signer.address,
        to_address,
        amount,
        currency,
        chain,
        message: 'Transaction signed and broadcasted successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error signing/broadcasting transaction:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to sign and broadcast transaction',
        details: error.stack,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
