import { PoolClient } from 'pg';
import { getSession } from './conversationService';
import { pool } from './db';
import { upsertUser } from './userService';

// Estados permitidos (se agrega expired para caducidad automática)
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'expired';

export interface OrderItemInput {
  productId: string;
  productName: string;
  size?: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderInput {
  phoneNumber: string;
  source: 'web' | 'whatsapp';
  items: OrderItemInput[];
  total: number;
  status: OrderStatus;
  notes?: string;
}

// Descuenta inventario según recetas configuradas en product_ingredients
const deductStock = async (client: PoolClient, items: OrderItemInput[], orderId: string) => {
  for (const item of items) {
    // Receta del producto
    const recipeRes = await client.query(
      `SELECT ingredient_id, quantity FROM product_ingredients WHERE product_id = $1`,
      [item.productId]
    );
    if (recipeRes.rowCount === 0) continue;

    for (const ingredient of recipeRes.rows) {
      const consumption = Number(ingredient.quantity) * Number(item.quantity);
      await client.query(
        `UPDATE ingredients SET stock = stock - $1, updated_at = NOW() WHERE id = $2`,
        [consumption, ingredient.ingredient_id]
      );
      await client.query(
        `INSERT INTO inventory_movements (ingredient_id, type, quantity, reason)
         VALUES ($1, 'sale', $2, $3)`,
        [ingredient.ingredient_id, -consumption, `Pedido #${orderId.slice(0, 8)}: ${item.productName}`]
      );
    }
  }
};

// Restaura inventario si se cancela el pedido
const restoreStock = async (client: PoolClient, items: OrderItemInput[], orderId: string) => {
  for (const item of items) {
    const recipeRes = await client.query(
      `SELECT ingredient_id, quantity FROM product_ingredients WHERE product_id = $1`,
      [item.productId]
    );
    if (recipeRes.rowCount === 0) continue;

    for (const ingredient of recipeRes.rows) {
      const consumption = Number(ingredient.quantity) * Number(item.quantity);
      await client.query(
        `UPDATE ingredients SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
        [consumption, ingredient.ingredient_id]
      );
      await client.query(
        `INSERT INTO inventory_movements (ingredient_id, type, quantity, reason)
         VALUES ($1, 'cancel', $2, $3)`,
        [ingredient.ingredient_id, consumption, `Cancelación #${orderId.slice(0, 8)}: ${item.productName}`]
      );
    }
  }
};

const formatOrderCode = (createdAt: Date, orderNumber: number) => {
  const day = String(createdAt.getDate()).padStart(2, '0');
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const year = String(createdAt.getFullYear()).slice(-2);
  const seq = String(orderNumber).padStart(2, '0');
  return `${day}${month}${year}sm${seq}`;
};

const getSequentialForWeek = async (createdAt: Date) => {
  const res = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM orders
    WHERE created_at >= date_trunc('week', $1::timestamptz)
      AND created_at <= $1
    `,
    [createdAt]
  );
  return Number(res.rows[0]?.count || 0);
};

// Marca como 'expired' pedidos confirmados hace más de 12 horas
const expireStaleOrders = async () => {
  await pool.query(`
    UPDATE orders
    SET status = 'expired'
    WHERE status = 'confirmed'
      AND created_at < NOW() - INTERVAL '12 hours'
  `);
};

export const createOrder = async (payload: OrderInput) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const session = getSession(payload.phoneNumber);
    const customer = session.customer;
    if (customer) {
      await upsertUser({
        phoneNumber: payload.phoneNumber,
        name: customer.name || null,
        email: customer.email || null,
        address: customer.address || null
      });
    }

    const orderRes = await client.query(
      `
      INSERT INTO orders (phone_number, source, items, total, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
      `,
      [
        payload.phoneNumber,
        payload.source,
        JSON.stringify(payload.items),
        payload.total,
        payload.status,
        payload.notes || null
      ]
    );

    const orderId = orderRes.rows[0].id as string;
    const createdAtRes = await client.query('SELECT created_at FROM orders WHERE id = $1', [orderId]);
    const createdAt = createdAtRes.rows[0]?.created_at as Date;
    const orderNumber = await getSequentialForWeek(new Date(createdAt));
    const orderCode = formatOrderCode(new Date(createdAt), orderNumber);

    // Descontar inventario según recetas; si falla, la transacción se revierte
    await deductStock(client, payload.items, orderId);

    await client.query('COMMIT');
    return { orderId, orderCode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
};

export const getOrderById = async (orderId: string) => {
  const res = await pool.query(
    `
    SELECT id, items, status
    FROM orders
    WHERE id = $1
    LIMIT 1
    `,
    [orderId]
  );
  if (res.rowCount === 0) return null;
  return res.rows[0];
};

export const restoreStockForOrder = async (orderId: string) => {
  const order = await getOrderById(orderId);
  if (!order) return;
  const items: OrderItemInput[] = order.items || [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await restoreStock(client, items, orderId);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const getLastOrderStatus = async (phoneNumber: string) => {
  const result = await pool.query(
    `SELECT id, status, total, created_at
     FROM orders
     WHERE phone_number = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [phoneNumber]
  );

  if (result.rowCount === 0) return null;

  const order = result.rows[0];
  return {
    orderId: order.id,
    status: order.status,
    total: Number(order.total),
    createdAt: order.created_at
  };
};

export const getActiveOrders = async () => {
  // Limpieza perezosa: expira pedidos viejos antes de listar
  await expireStaleOrders();

  const res = await pool.query(
    `
    SELECT 
      o.id,
      ROW_NUMBER() OVER (PARTITION BY date_trunc('week', o.created_at) ORDER BY o.created_at) AS "orderNumber",
      o.phone_number as "phoneNumber",
      COALESCE(u.name, o.phone_number) as "customerName",
      o.items,
      o.total,
      o.status,
      o.created_at as "createdAt",
      o.notes
    FROM orders o
    LEFT JOIN users u ON o.phone_number = u.phone_number
    WHERE o.status NOT IN ('cancelled', 'expired')
    ORDER BY o.created_at DESC
    LIMIT 50
    `
  );

  return res.rows.map((r) => ({
    id: r.id as string,
    orderCode: formatOrderCode(new Date(r.createdAt), Number(r.orderNumber)),
    customerName: r.customerName as string,
    phoneNumber: r.phoneNumber as string,
    items: r.items,
    total: Number(r.total),
    status: r.status as string,
    createdAt: r.createdAt,
    notes: r.notes as string | null
  }));
};

// --- NUEVAS FUNCIONES PARA REPORTES ---

export const getDailyStats = async () => {
  const revenueRes = await pool.query(`
    SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
    FROM orders 
    WHERE status = 'delivered' 
      AND created_at >= CURRENT_DATE
  `);

  const statusRes = await pool.query(`
    SELECT status, COUNT(*) as count 
    FROM orders 
    WHERE created_at >= CURRENT_DATE 
    GROUP BY status
  `);

  const statusCounts = statusRes.rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {} as Record<string, number>);

  return {
    revenue: Number(revenueRes.rows[0].total),
    completedOrders: parseInt(revenueRes.rows[0].count, 10),
    breakdown: statusCounts
  };
};

export const getOrderHistory = async () => {
  const res = await pool.query(`
    SELECT 
      o.id, 
      ROW_NUMBER() OVER (PARTITION BY date_trunc('week', o.created_at) ORDER BY o.created_at) AS "orderNumber",
      COALESCE(u.name, o.phone_number) as "customerName",
      o.total, 
      o.status, 
      o.created_at as "createdAt",
      o.items
    FROM orders o
    LEFT JOIN users u ON o.phone_number = u.phone_number
    WHERE o.status IN ('delivered', 'cancelled', 'expired')
    ORDER BY o.created_at DESC
    LIMIT 100
  `);

  return res.rows.map((r) => ({
    id: r.id as string,
    orderCode: formatOrderCode(new Date(r.createdAt), Number(r.orderNumber)),
    customerName: r.customerName as string,
    total: Number(r.total),
    status: r.status as string,
    createdAt: r.createdAt,
    itemCount: Array.isArray(r.items) ? r.items.length : 0
  }));
};

export const getSalesByDateRange = async (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Fechas inválidas');
  }

  const statsRes = await pool.query(
    `
    SELECT 
      COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) as revenue,
      COUNT(*) FILTER (WHERE status = 'delivered') as completed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
    FROM orders 
    WHERE created_at BETWEEN $1 AND $2
    `,
    [start, end]
  );

  const listRes = await pool.query(
    `
    SELECT 
      o.id, 
      ROW_NUMBER() OVER (PARTITION BY date_trunc('week', o.created_at) ORDER BY o.created_at) AS "orderNumber",
      COALESCE(u.name, o.phone_number) as "customerName",
      o.total, 
      o.status, 
      o.created_at as "createdAt",
      COALESCE(
        CASE 
          WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN jsonb_array_length(o.items::jsonb)
          ELSE 0
        END,
        0
      ) as "itemCount"
    FROM orders o
    LEFT JOIN users u ON o.phone_number = u.phone_number
    WHERE o.created_at BETWEEN $1 AND $2
    ORDER BY o.created_at DESC
    `,
    [start, end]
  );

  return {
    summary: {
      revenue: Number(statsRes.rows[0]?.revenue ?? 0),
      completedOrders: parseInt(statsRes.rows[0]?.completed ?? 0, 10),
      cancelledOrders: parseInt(statsRes.rows[0]?.cancelled ?? 0, 10)
    },
    orders: listRes.rows.map((r) => ({
      id: r.id as string,
      orderCode: formatOrderCode(
        r.createdAt ? new Date(r.createdAt) : new Date(),
        Number.isFinite(Number(r.orderNumber)) ? Number(r.orderNumber) : 0
      ),
      customerName: r.customerName as string,
      total: Number(r.total),
      status: r.status as string,
      createdAt: r.createdAt,
      itemCount: Number(r.itemCount)
    }))
  };
};
