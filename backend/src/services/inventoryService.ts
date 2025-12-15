import { pool } from './db';

export const getIngredients = async () => {
  const res = await pool.query('SELECT * FROM ingredients ORDER BY name');
  return res.rows;
};

export const upsertIngredient = async (data: any) => {
  const { id, name, unit, cost, stock, min_stock } = data;
  await pool.query(
    `
    INSERT INTO ingredients (id, name, unit, cost, stock, min_stock, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      cost = EXCLUDED.cost,
      min_stock = EXCLUDED.min_stock,
      updated_at = NOW()
    `,
    [id, name, unit, cost, stock, min_stock]
  );
};

export const registerMovement = async (ingredientId: string, type: string, quantity: number, reason: string) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO inventory_movements (ingredient_id, type, quantity, reason)
       VALUES ($1, $2, $3, $4)`,
      [ingredientId, type, quantity, reason]
    );

    await client.query(
      `UPDATE ingredients SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
      [quantity, ingredientId]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
