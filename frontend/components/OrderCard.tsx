import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  ChefHat,
  ShoppingBag,
  Truck,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  XCircle
} from 'lucide-react';
import { Order, OrderStatus, OrderAction } from '../types';

interface OrderCardProps {
  order: Order;
  onUpdateStatus: (id: string, status: OrderStatus, phoneNumber?: string) => void;
}

const getNextAction = (status: OrderStatus): OrderAction | null => {
  switch (status) {
    case 'confirmed':
      return { label: 'Aceptar Pedido', nextStatus: 'preparing', color: 'bg-kitchen-accent hover:bg-orange-600', icon: 'chef' };
    case 'preparing':
      return { label: 'Despachado', nextStatus: 'out_for_delivery', color: 'bg-kitchen-info hover:bg-blue-600', icon: 'truck' };
    case 'out_for_delivery':
      return { label: 'Entregado', nextStatus: 'delivered', color: 'bg-slate-700 hover:bg-slate-600', icon: 'check' };
    default:
      return null;
  }
};

const StatusBadge = ({ status }: { status: OrderStatus }) => {
  const styles = {
    confirmed: 'bg-slate-700 text-slate-200 border-slate-600',
    preparing: 'bg-kitchen-accent/20 text-orange-400 border-kitchen-accent/50',
    ready: 'bg-kitchen-success/20 text-green-400 border-kitchen-success/50',
    out_for_delivery: 'bg-kitchen-info/20 text-blue-400 border-kitchen-info/50',
    delivered: 'bg-slate-800 text-slate-500 border-slate-700',
    cancelled: 'bg-red-900/20 text-red-400 border-red-900/50'
  };

  const labels: Record<string, string> = {
    confirmed: 'Nuevo',
    preparing: 'Cocinando',
    ready: 'Listo',
    out_for_delivery: 'En Ruta',
    delivered: 'Finalizado',
    cancelled: 'Cancelado'
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
        styles[status] || styles.confirmed
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

export const OrderCard: React.FC<OrderCardProps> = ({ order, onUpdateStatus }) => {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const action = getNextAction(order.status);

  useEffect(() => {
    const calculateTime = () => {
      const now = Date.now();
      const created = new Date(order.createdAt).getTime();
      const diff = Math.floor((now - created) / 60000);
      setElapsedMinutes(diff);
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000 * 60);
    return () => clearInterval(interval);
  }, [order.createdAt]);

  const isOverdue = elapsedMinutes > 30 && order.status !== 'delivered' && order.status !== 'cancelled';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative flex flex-col h-full bg-slate-900/50 backdrop-blur-md border rounded-xl overflow-hidden shadow-lg transition-all
        ${isOverdue ? 'border-kitchen-danger/60 ring-1 ring-kitchen-danger/30' : 'border-slate-800 hover:border-slate-600'}
        ${order.status === 'confirmed' ? 'animate-pulse' : ''}
      `}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Header */}
      <div className="p-4 flex justify-between items-start border-b border-white/5 bg-white/5 relative">
        <div>
          <h3 className="text-2xl font-mono font-bold text-white tracking-tighter">
            {order.orderCode || `${order.id.slice(0, 8)}...`}
          </h3>
          <p className="text-sm text-slate-400 font-medium truncate max-w-[140px]">{order.customerName}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />

            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <MoreVertical size={18} />
                </button>

                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute right-0 top-8 z-20 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          if (confirm('¿Rechazar este pedido?')) onUpdateStatus(order.id, 'cancelled', order.phoneNumber);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <XCircle size={16} /> Rechazar Pedido
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div
            className={`flex items-center gap-1.5 text-sm font-mono font-bold ${
              isOverdue ? 'text-kitchen-danger animate-pulse' : 'text-slate-400'
            }`}
          >
            {isOverdue ? <AlertCircle size={14} /> : <Clock size={14} />}
            <span>{elapsedMinutes} min</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 overflow-y-auto min-h-[120px]">
        {order.notes && (
          <div className="mb-3 p-3 bg-yellow-900/30 border border-yellow-700 text-yellow-100 rounded-lg text-sm">
            ⚠️ Nota del cliente: {order.notes}
          </div>
        )}
        <ul className="space-y-3">
          {order.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded bg-slate-800 text-slate-200 text-sm font-bold shrink-0">
                {item.quantity}
              </span>
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium leading-tight">{item.productName || item.name}</span>
                {item.size && <span className="text-xs text-slate-500">Tamaño: {item.size}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="p-4 mt-auto border-t border-white/5 bg-slate-900/80">
        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-500 text-sm font-medium">Total</span>
          <span className="text-xl font-bold text-white">S/. {order.total.toFixed(2)}</span>
        </div>

        {action ? (
          <button
            onClick={() => onUpdateStatus(order.id, action.nextStatus, order.phoneNumber)}
            className={`w-full py-4 rounded-lg flex items-center justify-center gap-2 text-white font-bold text-lg shadow-lg active:scale-[0.98] transition-all ${action.color}`}
          >
            {action.icon === 'chef' && <ChefHat size={24} />}
            {action.icon === 'bag' && <ShoppingBag size={24} />}
            {action.icon === 'truck' && <Truck size={24} />}
            {action.icon === 'check' && <CheckCircle size={24} />}
            {action.label}
          </button>
        ) : (
          <div className="w-full py-4 rounded-lg bg-slate-800/50 text-slate-500 font-bold text-center flex items-center justify-center gap-2 cursor-not-allowed border border-slate-800">
            {order.status === 'cancelled' ? <XCircle size={20} /> : <CheckCircle size={20} />}
            {order.status === 'cancelled' ? 'Pedido Rechazado' : 'Pedido Cerrado'}
          </div>
        )}
      </div>
    </motion.div>
  );
};
