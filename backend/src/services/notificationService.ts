import { sendWhatsappMessage } from './whatsappService';

export type NotificationType =
  | 'order_confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export const notifyStatus = async (to: string, type: NotificationType, variables: string[]): Promise<unknown> => {
  // Mensajes de texto simple (no requieren aprobación de plantillas)
  const messages: Record<NotificationType, string> = {
    order_confirmed: `📦 Actualización automática de tu pedido\n\n✅ Estado: Confirmado\n💰 Total: S/${variables[1] || '0.00'}\n\nGracias por tu compra.`,
    preparing: '📦 Actualización automática de tu pedido\n\n👨‍🍳 Estado: Preparando\n🔥 Tu orden ya está en cocina.',
    ready: '📦 Actualización automática de tu pedido\n\n🥡 Estado: Listo para despacho\nEn breve saldrá a entrega.',
    out_for_delivery: '📦 Actualización automática de tu pedido\n\n🛵 Estado: En camino\nPrepárate para recibirlo.',
    delivered: '📦 Actualización automática de tu pedido\n\n🏠 Estado: Entregado\n¡Gracias por elegir San Marzano! 🍕',
    cancelled: '📦 Actualización automática de tu pedido\n\n❌ Estado: Cancelado\nLamentamos informarte que tu orden fue cancelada. Pronto un representante se comunicará contigo. Gracias.'
  };

  const messageText = messages[type];

  if (!messageText) {
    console.warn(`No hay mensaje definido para el estado: ${type}`);
    return;
  }

  // Envío como texto plano
  return sendWhatsappMessage({
    to,
    type: 'text',
    text: { body: messageText }
  });
};
