import { Request, Response } from 'express';
import { Pool } from 'pg';
import { loadEnv } from '../../config/environment';

const pool = new Pool({
  connectionString: loadEnv().databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

export const getOrderStatus = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const result = await pool.query('SELECT id, status, total, phone_number FROM orders WHERE id = $1', [orderId]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.status(200).json(result.rows[0]);
};
