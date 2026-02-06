#!/usr/bin/env node

/**
 * AgentsBank.ai CLI Admin Tool
 * 
 * Usage:
 * agentsbank-cli agent:list
 * agentsbank-cli agent:create --human-id <id> --first-name Bot --last-name Smith
 * agentsbank-cli agent:suspend <agent-id>
 * agentsbank-cli wallet:create <agent-id> --chain ethereum
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { supabase } from '../config/supabase.js';

interface AgentRecord {
  agent_id: string;
  agent_username: string;
  first_name: string;
  last_name: string;
  did?: string;
  status: string;
  reputation_score: number;
  created_at: string;
}

interface WalletRecord {
  wallet_id: string;
  chain: string;
  address: string;
  type: string;
  balance?: { native: string };
  created_at: string;
}

interface TransactionRecord {
  tx_id: string;
  type: string;
  amount: string;
  status: string;
  to_address: string;
  fee: string;
  timestamp: string;
}

const program = new Command();

program.name('agentsbank-cli').description('AgentsBank.ai Management Tool').version('0.1.0');

// Agent commands
const agentCmd = program.command('agent').description('Agent management');

agentCmd
  .command('list [human-id]')
  .description('List all agents or agents for a human')
  .action(async (humanId) => {
    try {
      let query = supabase.from('agents').select();

      if (humanId) {
        query = query.eq('human_id', humanId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const table = new Table({
        head: ['Agent ID', 'Username', 'Name', 'DID', 'Status', 'Reputation', 'Created'],
        colWidths: [38, 25, 20, 30, 12, 12, 20],
      });

      (data || []).forEach((agent: AgentRecord) => {
        table.push([
          agent.agent_id.substring(0, 8),
          agent.agent_username,
          `${agent.first_name} ${agent.last_name}`,
          agent.did?.substring(0, 28) || 'N/A',
          agent.status,
          agent.reputation_score.toString(),
          new Date(agent.created_at).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.green(`✓ Total: ${data?.length || 0} agents`));
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

agentCmd
  .command('suspend <agent-id>')
  .description('Suspend an agent')
  .action(async (agentId) => {
    try {
      const { error } = await supabase
        .from('agents')
        .update({ status: 'suspended' })
        .eq('agent_id', agentId);

      if (error) throw error;

      console.log(chalk.green(`✓ Agent ${agentId.substring(0, 8)} suspended`));
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

agentCmd
  .command('activate <agent-id>')
  .description('Activate a suspended agent')
  .action(async (agentId) => {
    try {
      const { error } = await supabase
        .from('agents')
        .update({ status: 'active' })
        .eq('agent_id', agentId);

      if (error) throw error;

      console.log(chalk.green(`✓ Agent ${agentId.substring(0, 8)} activated`));
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

// Wallet commands
const walletCmd = program.command('wallet').description('Wallet management');

walletCmd
  .command('list [agent-id]')
  .description('List wallets for an agent')
  .action(async (agentId) => {
    try {
      if (!agentId) {
        console.error(chalk.red('Agent ID required'));
        process.exit(1);
      }

      const { data, error } = await supabase
        .from('wallets')
        .select()
        .eq('agent_id', agentId);

      if (error) throw error;

      const table = new Table({
        head: ['Wallet ID', 'Chain', 'Address', 'Type', 'Balance', 'Created'],
        colWidths: [38, 12, 42, 15, 15, 20],
      });

      (data || []).forEach((wallet: WalletRecord) => {
        const balance = wallet.balance?.native || '0';
        table.push([
          wallet.wallet_id.substring(0, 8),
          wallet.chain,
          wallet.address.substring(0, 40),
          wallet.type,
          balance,
          new Date(wallet.created_at).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.green(`✓ Total: ${data?.length || 0} wallets`));
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

// Transaction commands
const txCmd = program.command('tx').description('Transaction management');

txCmd
  .command('list [wallet-id]')
  .option('-s, --status <status>', 'Filter by status')
  .description('List transactions for a wallet')
  .action(async (walletId, options) => {
    try {
      if (!walletId) {
        console.error(chalk.red('Wallet ID required'));
        process.exit(1);
      }

      let query = supabase
        .from('transactions')
        .select()
        .eq('wallet_id', walletId)
        .order('timestamp', { ascending: false });

      if (options.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const table = new Table({
        head: ['TX ID', 'Type', 'Amount', 'Status', 'To Address', 'Fee', 'Timestamp'],
        colWidths: [8, 10, 12, 12, 42, 10, 20],
      });

      (data || []).forEach((tx: TransactionRecord) => {
        table.push([
          tx.tx_id.substring(0, 8),
          tx.type,
          tx.amount,
          tx.status,
          tx.to_address.substring(0, 40),
          tx.fee,
          new Date(tx.timestamp).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.green(`✓ Total: ${data?.length || 0} transactions`));
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show system statistics')
  .action(async () => {
    try {
      const { count: humanCount } = await supabase
        .from('humans')
        .select('*', { count: 'exact', head: true });

      const { count: agentCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true });

      const { count: walletCount } = await supabase
        .from('wallets')
        .select('*', { count: 'exact', head: true });

      const { count: txCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      console.log(chalk.bold.blue('\n📊 AgentsBank.ai Statistics\n'));
      console.log(chalk.cyan('  Humans:       '), humanCount);
      console.log(chalk.cyan('  Agents:       '), agentCount);
      console.log(chalk.cyan('  Wallets:      '), walletCount);
      console.log(chalk.cyan('  Transactions: '), txCount);
      console.log('');
    } catch (error) {
      console.error(chalk.red('✗ Error:'), error);
      process.exit(1);
    }
  });

program.parse();
