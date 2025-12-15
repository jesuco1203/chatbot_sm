import { Pool } from 'pg';
import { loadEnv } from '../config/environment';

const env = loadEnv();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
console.log('>>> DATABASE_URL:', env.databaseUrl);
console.log('>>> TLS OFF:', process.env.NODE_TLS_REJECT_UNAUTHORIZED);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});
