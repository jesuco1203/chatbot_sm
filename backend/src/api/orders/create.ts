import { Request, Response } from 'express';
import { createOrder } from '../../services/orderService';
import { notifyStatus } from '../../services/notificationService';

export const createOrderHandler = async (req: Request, res: Response) => {
  const { phoneNumber, source, items, total, notes } = req.body;
  const payload = {
    phoneNumber,
    source,
    items,
    total,
    status: 'confirmed' as const,
    notes
  };

  const result = await createOrder(payload);
  await notifyStatus(phoneNumber, 'order_confirmed', [result.orderId, total.toFixed(2)]);
  res.status(201).json(result);
};
