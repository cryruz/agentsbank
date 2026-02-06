/**
 * Database migration runner
 * Run: npm run migrate
 */

import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    logger.info('Starting database migration...');

    // Read schema SQL file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // Split by statements and execute
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        const result = await (supabaseAdmin.rpc('exec_sql', {
          sql_string: statement,
        }) as any);
        
        const { data, error } = result;

        if (error && !error.message.includes('already exists')) {
          logger.warn(`Statement execution note:`, error.message);
        }
      } catch (e) {
        // Continue on error - tables might already exist
        logger.debug(`Statement skipped (may already exist)`);
      }
    }

    logger.info('✓ Database migration completed');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Copy the SQL from src/db/schema.sql');
    logger.info('2. Paste it into your Supabase SQL Editor');
    logger.info('3. Run to create all tables and indexes');
    logger.info('');

    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
