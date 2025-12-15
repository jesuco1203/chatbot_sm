import { Request, Response } from 'express';
import { updateOrderStatus, OrderStatus, restoreStockForOrder } from '../../services/orderService';
import { notifyStatus, NotificationType } from '../../services/notificationService';

export const updateOrderHandler = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { status, phoneNumber, templateVariables } = req.body as {
    status: NotificationType | OrderStatus;
    phoneNumber?: string;
    templateVariables?: string[];
  };

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  const statusMap: Record<NotificationType, OrderStatus> = {
    order_confirmed: 'confirmed',
    preparing: 'preparing',
    ready: 'ready',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    cancelled: 'cancelled'
  };

  const nextStatus = statusMap[status as NotificationType] ?? (status as OrderStatus);

  if (!nextStatus) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  await updateOrderStatus(orderId, nextStatus);

  // Restaurar stock si se cancela el pedido
  if (nextStatus === 'cancelled') {
    try {
      await restoreStockForOrder(orderId);
    } catch (err) {
      console.error('Error restoring stock on cancel:', err);
    }
  }

  const isNotifyType = statusMap[status as NotificationType] || status === 'cancelled';
  if (phoneNumber && isNotifyType) {
    const notifyKey = (status === 'cancelled' ? 'cancelled' : status) as NotificationType;
    await notifyStatus(phoneNumber, notifyKey, templateVariables || []);
  }

  res.status(200).json({ status: 'ok' });
};
