// Supabase Edge Function: Broadcast Transaction
// Path: supabase/functions/broadcast-transaction/index.ts
// Broadcasts signed transaction to blockchain

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ethers } from 'npm:ethers@6'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

interface BroadcastRequest {
  tx_id: string
  chain: string
  signed_tx: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body: BroadcastRequest = await req.json()
    const { tx_id, chain, signed_tx } = body

    const rpcUrls: Record<string, string> = {
      ethereum: Deno.env.get('ETH_RPC_URL') || 'https://eth-mainnet.g.alchemy.com/v2/demo',
      bsc: Deno.env.get('BNB_RPC_URL') || 'https://bsc-dataseed.bnbchain.org',
    }

    const provider = new ethers.JsonRpcProvider(rpcUrls[chain])

    // Broadcast transaction
    const txResponse = await provider.broadcastTransaction(signed_tx)
    const txHash = txResponse.hash

    // Update transaction record
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        tx_hash: txHash,
        status: 'pending',
        metadata: {
          broadcast_at: new Date().toISOString(),
        },
      })
      .eq('tx_id', tx_id)

    if (updateError) {
      console.error('Failed to update transaction:', updateError)
    }

    // Log action
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'transaction',
        entity_id: tx_id,
        action: 'transaction_broadcast',
        actor: 'system',
        actor_type: 'system',
        details: { chain, tx_hash: txHash },
      })

    return new Response(
      JSON.stringify({
        tx_hash: txHash,
        status: 'pending',
        message: 'Transaction broadcasted successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error broadcasting transaction:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to broadcast transaction' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
