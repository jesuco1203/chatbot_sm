import { pool } from './db';

// Lógica maestra: crea si no existe, actualiza si existe, revive si estaba inactivo.
const upsertProductLogic = async (id: string, data: any) => {
  const { name, description, category, prices, keywords, imageUrl, image_url } = data;
  const isActive = data.isActive ?? data.is_active;
  await pool.query(
    `INSERT INTO products (id, name, description, category, prices, keywords, image_url, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true), NOW())
     ON CONFLICT (id) 
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       prices = EXCLUDED.prices,
       keywords = EXCLUDED.keywords,
       image_url = EXCLUDED.image_url,
       is_active = COALESCE(EXCLUDED.is_active, products.is_active), 
       updated_at = NOW()`,
    [
      id,
      name,
      description,
      category,
      JSON.stringify(prices),
      keywords,
      imageUrl ?? image_url ?? null,
      isActive
    ]
  );
};

export const updateProduct = async (id: string, data: any) => {
  await upsertProductLogic(id.trim(), data);
};

export const createProduct = async (data: any) => {
  await upsertProductLogic(data.id, data);
};

export const deleteProduct = async (id: string) => {
  await pool.query('UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
};

export type ProductCategory = 'pizza' | 'lasagna' | 'drink' | 'extra';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  prices: Record<string, number>;
  imageUrl?: string | null;
  isActive: boolean;
  keywords?: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const mapRowToProduct = (row: any): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  prices: row.prices,
  imageUrl: row.image_url || null,
  isActive: row.is_active ?? true,
  keywords: row.keywords,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const getAllProducts = async (): Promise<Product[]> => {
  const res = await pool.query(
    `
    SELECT id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at
    FROM products
    WHERE is_active IS NOT FALSE
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(mapRowToProduct);
};

export const getProductById = async (id: string): Promise<Product | null> => {
  const res = await pool.query(
    `
    SELECT id, name, description, category, prices, image_url, is_active, keywords, created_at, updated_at
    FROM products
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  if (res.rowCount === 0) return null;
  return mapRowToProduct(res.rows[0]);
};

export const getRecipe = async (productId: string) => {
  const res = await pool.query(
    `
    SELECT r.ingredient_id, r.quantity, i.name, i.unit
    FROM product_ingredients r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.product_id = $1
    ORDER BY i.name
    `,
    [productId]
  );
  return res.rows;
};

export const saveRecipe = async (productId: string, ingredients: Array<{ ingredient_id: string; quantity: number }>) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_ingredients WHERE product_id = $1', [productId]);
    for (const ing of ingredients) {
      await client.query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, quantity) VALUES ($1, $2, $3)`,
        [productId, ing.ingredient_id, ing.quantity]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
