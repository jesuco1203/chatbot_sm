import { Request, Response } from 'express';
import { Pool } from 'pg';
import { loadEnv } from '../../config/environment';

const pool = new Pool({
  connectionString: loadEnv().databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

export const listProducts = async (req: Request, res: Response) => {
  const includeInactive = String(req.query.all || '').toLowerCase() === 'true';
  const whereClause = includeInactive ? '' : 'WHERE is_active = true';
  const result = await pool.query(`SELECT * FROM products ${whereClause} ORDER BY category, name`);
  res.status(200).json(result.rows);
};
