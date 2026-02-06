import { config } from 'dotenv';
config();

import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

async function createAndInsertUser() {
  const password = 'TestUser@123';
  const hash = await bcrypt.hash(password, 10);
  const userId = uuidv4();

  console.log('Creating test user...');
  console.log('User ID:', userId);
  console.log('Password:', password);
  console.log('Hash:', hash);

  // Use service key for insertion
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase
    .from('humans')
    .insert({
      human_id: userId,
      username: 'testuser2',
      email: 'testuser2@test.com',
      password_hash: hash,
    })
    .select();

  if (error) {
    console.error('❌ Insert Error:', error);
    return;
  }

  console.log('\n✅ User created successfully!');
  console.log('Inserted data:', JSON.stringify(data, null, 2));

  // Now verify it exists by querying
  const { data: queryData, error: queryError } = await supabase
    .from('humans')
    .select('human_id, username, password_hash')
    .eq('username', 'testuser2');

  if (queryError) {
    console.error('❌ Query Error:', queryError);
  } else {
    console.log('\n✅ Query successful!');
    console.log('Query result:', JSON.stringify(queryData, null, 2));
  }

  // Test bcrypt comparison
  const match = await bcrypt.compare(password, hash);
  console.log('\nBcrypt verify:', match ? '✅ OK' : '❌ FAILED');
}

createAndInsertUser();
