#!/usr/bin/env npx tsx
/**
 * Create test user with proper password hashing
 */

import { config } from 'dotenv';
config();

import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function createTestUser() {
  const password = 'TestUser@123';
  const hash = await bcrypt.hash(password, 10);
  const userId = uuidv4();

  console.log('Creating test user...');
  console.log('Password:', password);
  console.log('Hash:', hash);

  const { data, error } = await supabase
    .from('humans')
    .insert({
      human_id: userId,
      username: 'testuser2',
      email: 'testuser2@test.com',
      password_hash: hash,
    })
    .select()
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n✅ User created successfully!');
  console.log('Username: testuser2');
  console.log('Password: TestUser@123');

  // Test bcrypt comparison
  const match = await bcrypt.compare(password, hash);
  console.log('Bcrypt verify:', match ? '✅ OK' : '❌ FAILED');
}

createTestUser();
