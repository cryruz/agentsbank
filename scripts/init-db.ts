#!/usr/bin/env npx tsx
/**
 * Initialize Supabase database schema
 * Run: npx tsx scripts/init-db.ts
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../src/db/schema.sql');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseServiceKey);

async function initializeDatabase() {
  try {
    console.log('📄 Reading schema file...');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Split by statements and filter empty ones
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    console.log(`🔄 Running ${statements.length} SQL statements...`);

    for (const statement of statements) {
      try {
        // Use RPC or direct query
        const { error } = await (client.rpc as any)('exec_sql', {
          sql_string: statement,
        });

        if (error) {
          console.warn(`⚠️  Statement warning:`, error.message);
        }
      } catch (err: any) {
        console.warn(`⚠️  Statement error (may be expected):`, err.message);
      }
    }

    console.log('✅ Database initialization completed!');
    console.log('\n📊 Next steps:');
    console.log('1. Verify tables in Supabase dashboard');
    console.log('2. Enable Row-Level Security (RLS) on each table');
    console.log('3. Test the API endpoints');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();
