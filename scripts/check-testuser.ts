import { supabase } from '../src/config/supabase.js';

async function checkUser() {
  const { data, error } = await supabase
    .from('humans')
    .select('human_id, username, password_hash')
    .eq('username', 'testuser2');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('testuser2 record:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkUser();
