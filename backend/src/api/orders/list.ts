import { Request, Response } from 'express';
import { getActiveOrders } from '../../services/orderService';

export const listOrdersHandler = async (_req: Request, res: Response) => {
  try {
    const orders = await getActiveOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};
