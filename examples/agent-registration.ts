/**
 * Agent Self-Registration Example
 * 
 * Shows how an agent can autonomously register itself and its human owner
 * The agent asks the human for necessary information
 */

import { AgentsBankSDK } from '../src/sdk/index.js';

async function main() {
  // Create SDK instance
  const bank = new AgentsBankSDK({
    apiUrl: 'http://localhost:3000/api',
  });

  try {
    // Option 1: Agent self-registers with interactive prompts
    // Agent will ask the human for: username, email, names, and password
    console.log('Option 1: Interactive Registration (Agent asks Human)');
    console.log('=====================================================\n');

    const result = await bank.registerSelf();
    
    console.log('Agent Registration Details:');
    console.log(`  Username: ${result.agentUsername}`);
    console.log(`  Password: ${result.agentPassword}`);
    console.log(`  Token: ${result.token.substring(0, 20)}...`);

    // Option 2: Agent self-registers with pre-provided values
    // Agent doesn't need to ask if it already knows the info
    console.log('\n\nOption 2: Programmatic Registration (Agent already knows info)');
    console.log('============================================================\n');

    const result2 = await bank.registerSelf({
      humanUsername: 'john_doe',
      humanEmail: 'john@example.com',
      firstName: 'ChatBot',
      lastName: 'Pro',
      agentPassword: 'SecurePass123!',
    });

    console.log('Agent Registration Details:');
    console.log(`  Username: ${result2.agentUsername}`);
    console.log(`  Token: ${result2.token.substring(0, 20)}...`);

    // After registration, agent can create wallets
    const wallet = await bank.createWallet('ethereum');
    console.log(`\n✅ Created Ethereum wallet: ${wallet.address}`);

  } catch (error) {
    console.error('Registration failed:', error);
    process.exit(1);
  }
}

main();
