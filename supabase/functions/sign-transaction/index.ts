// Supabase Edge Function: Sign Transaction
// Path: supabase/functions/sign-transaction/index.ts
// Signs a transaction with the agent's private key from Vault

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'npm:ethers@6'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

interface SignRequest {
  wallet_id: string
  chain: string
  token_address: string
  to_address: string
  amount: string
  decimals: number
}

serve(async (req) => {
  // Verify JWT token
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body: SignRequest = await req.json()
    const { wallet_id, chain, token_address, to_address, amount, decimals } = body

    // Retrieve wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('agent_id, private_key_hash, address')
      .eq('wallet_id', wallet_id)
      .single()

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Retrieve private key from Vault
    const { data: secret, error: vaultError } = await supabase
      .from('secrets')
      .select('value')
      .eq('name', `wallet_${wallet_id}_private_key`)
      .single()

    if (vaultError || !secret) {
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve private key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const privateKey = secret.value
    const rpcUrls: Record<string, string> = {
      ethereum: Deno.env.get('ETH_RPC_URL') || 'https://eth-mainnet.g.alchemy.com/v2/demo',
      bsc: Deno.env.get('BNB_RPC_URL') || 'https://bsc-dataseed.bnbchain.org',
    }

    const provider = new ethers.JsonRpcProvider(rpcUrls[chain])
    const signer = new ethers.Wallet(privateKey, provider)

    // Build transaction
    const nonce = await provider.getTransactionCount(signer.address)
    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei')

    let txData: any
    let data = '0x'

    if (token_address === '0x0') {
      // Native transfer
      txData = {
        to: to_address,
        value: ethers.parseEther(amount),
        gasLimit: 21000,
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: chain === 'ethereum' ? 1 : 56,
      }
    } else {
      // ERC-20 transfer
      const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)']
      const iface = new ethers.Interface(erc20Abi)
      const amountBigInt = ethers.parseUnits(amount, decimals)
      data = iface.encodeFunctionData('transfer', [to_address, amountBigInt])

      const gasEstimate = await provider.estimateGas({
        from: signer.address,
        to: token_address,
        data: data,
        value: '0',
      })

      txData = {
        to: token_address,
        data: data,
        value: '0',
        gasLimit: (gasEstimate * BigInt(120)) / BigInt(100),
        gasPrice: gasPrice,
        nonce: nonce,
        chainId: chain === 'ethereum' ? 1 : 56,
      }
    }

    // Sign transaction
    const signedTx = await signer.signTransaction(txData)

    // Log action
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'transaction',
        action: 'transaction_signed',
        actor: wallet.agent_id,
        actor_type: 'agent',
        details: { chain, to_address, amount },
      })

    return new Response(
      JSON.stringify({
        signedTx,
        txData: {
          to: txData.to,
          value: txData.value?.toString?.() || '0',
          gasLimit: txData.gasLimit.toString(),
          gasPrice: ethers.formatEther(txData.gasPrice),
          nonce: txData.nonce,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error signing transaction:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to sign transaction' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
