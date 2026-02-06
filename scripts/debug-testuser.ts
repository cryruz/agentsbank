import { config } from 'dotenv';
config();

import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

async function debugLogin() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get the user
  const { data: user, error: userError } = await supabase
    .from('humans')
    .select('human_id, username, password_hash')
    .eq('username', 'testuser2')
    .single();

  if (userError) {
    console.error('❌ User query error:', userError);
    return;
  }

  console.log('✅ User found:');
  console.log('  Username:', user.username);
  console.log('  Stored hash:', user.password_hash);
  
  // Test bcrypt compare
  const password = 'TestUser@123';
  const isValid = await bcrypt.compare(password, user.password_hash);
  
  console.log('\n🔐 Password verification:');
  console.log('  Test password:', password);
  console.log('  Bcrypt compare result:', isValid ? '✅ MATCH' : '❌ MISMATCH');
}

debugLogin();
