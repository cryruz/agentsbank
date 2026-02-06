#!/usr/bin/env npx tsx
/**
 * Seed database with test data
 * Run: npx tsx scripts/seed-db.ts
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with test data...\n');

    // 1. Create test human
    const humanPassword = await bcrypt.hash('TestPassword@123', 10);
    const humanId = uuidv4();

    console.log('📝 Creating test human...');
    const { error: humanError } = await client
      .from('humans')
      .insert([
        {
          human_id: humanId,
          username: 'testcoder',
          email: 'testcoder@agentsbank.ai',
          password_hash: humanPassword,
          created_at: new Date().toISOString(),
        },
      ]);

    if (humanError && !humanError.message.includes('unique')) {
      console.warn('⚠️  Human creation warning:', humanError.message);
    } else {
      console.log('✅ Human created: testcoder');
    }

    // 2. Create test agent
    const agentPassword = await bcrypt.hash('AgentPassword@123', 10);
    const agentId = uuidv4();
    const apiKey = uuidv4();

    console.log('🤖 Creating test agent...');
    const { error: agentError } = await client
      .from('agents')
      .insert([
        {
          agent_id: agentId,
          human_id: humanId,
          first_name: 'AI',
          last_name: 'Assistant',
          agent_username: 'ai-assistant-001',
          agent_password_hash: agentPassword,
          did: `did:example:${agentId.substring(0, 8)}`,
          reputation_score: 95.5,
          status: 'active',
          api_key: apiKey,
          guardrails: {
            max_daily_spend: '1000',
            max_transaction_amount: '100',
          },
          created_at: new Date().toISOString(),
        },
      ]);

    if (agentError && !agentError.message.includes('unique')) {
      console.warn('⚠️  Agent creation warning:', agentError.message);
    } else {
      console.log('✅ Agent created: ai-assistant-001');
      console.log(`   API Key: ${apiKey}`);
    }

    // 3. Create test wallets
    const walletId1 = uuidv4();
    const walletId2 = uuidv4();

    console.log('💰 Creating test wallets...');
    const { error: walletError } = await client.from('wallets').insert([
      {
        wallet_id: walletId1,
        agent_id: agentId,
        chain: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42eE0',
        balance: { native: '5.5' },
        type: 'non-custodial',
        created_at: new Date().toISOString(),
      },
      {
        wallet_id: walletId2,
        agent_id: agentId,
        chain: 'bsc',
        address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        balance: { native: '10.2' },
        type: 'non-custodial',
        created_at: new Date().toISOString(),
      },
    ]);

    if (walletError && !walletError.message.includes('unique')) {
      console.warn('⚠️  Wallet creation warning:', walletError.message);
    } else {
      console.log('✅ Wallets created:');
      console.log('   - Ethereum: 5.5 ETH');
      console.log('   - BSC: 10.2 BNB');
    }

    // 4. Create test transactions
    console.log('📊 Creating test transactions...');
    const { error: txError } = await client.from('transactions').insert([
      {
        tx_id: uuidv4(),
        wallet_id: walletId1,
        type: 'transfer',
        amount: '1.5',
        currency: 'ETH',
        from_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42eE0',
        to_address: '0x1234567890123456789012345678901234567890',
        tx_hash: '0xabcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
        status: 'confirmed',
        fee: '0.001',
        timestamp: new Date().toISOString(),
        metadata: { note: 'Test transfer' },
      },
      {
        tx_id: uuidv4(),
        wallet_id: walletId2,
        type: 'swap',
        amount: '2.0',
        currency: 'BNB',
        from_address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        to_address: '0xUNISWAP_ROUTER',
        tx_hash: '0xef1234abcdef1234abcdef1234abcdef1234abcdef1234abcdef1234abcdef',
        status: 'confirmed',
        fee: '0.0005',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        metadata: { swapTo: 'USDT', route: 'BNB->USDT' },
      },
    ]);

    if (txError && !txError.message.includes('unique')) {
      console.warn('⚠️  Transaction creation warning:', txError.message);
    } else {
      console.log('✅ Test transactions created');
    }

    console.log('\n✨ Database seeding completed!\n');
    console.log('📝 Test Credentials:');
    console.log('   Human: testcoder / TestPassword@123');
    console.log('   Agent: ai-assistant-001 / AgentPassword@123');
    console.log(`   Agent API Key: ${apiKey}\n`);
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
