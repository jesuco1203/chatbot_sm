import React, { useState } from 'react';
import { useOrders } from '../hooks/useOrders';
import { OrderCard } from './OrderCard';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, UtensilsCrossed, Volume2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { orders, isLoading, isError, updateStatus } = useOrders();
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const enableAudio = () => {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      ctx.resume().then(() => {
        ctx.close();
        setAudioUnlocked(true);
      });
    } else {
      setAudioUnlocked(true);
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    const statusPriority = { confirmed: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4 };
    const priorityDiff = (statusPriority[a.status] || 0) - (statusPriority[b.status] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const activeOrders = sortedOrders.filter((o) => {
    if (o.status !== 'delivered') return true;
    const doneTime = new Date(o.createdAt).getTime();
    const oneHour = 1000 * 60 * 60;
    return Date.now() - doneTime < oneHour;
  });

  if (!audioUnlocked) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm text-white p-4">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full text-center">
          <div className="bg-kitchen-accent/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-kitchen-accent animate-pulse">
            <Volume2 size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Iniciar Turno de Cocina</h2>
          <p className="text-slate-400 mb-8">Necesitamos tu permiso para activar las alertas sonoras de nuevos pedidos.</p>
          <button
            onClick={enableAudio}
            className="w-full py-4 bg-kitchen-accent hover:bg-orange-600 text-white font-bold rounded-xl text-lg transition-all active:scale-95 shadow-lg shadow-orange-500/20"
          >
            🔔 Activar Sistema
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-80px)] w-full flex flex-col items-center justify-center text-slate-500 gap-4">
        <Loader2 className="animate-spin h-12 w-12 text-kitchen-accent" />
        <p className="font-mono text-lg animate-pulse">Conectando a cocina...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-[calc(100vh-80px)] w-full flex items-center justify-center text-kitchen-danger">
        <p className="font-bold text-2xl">Error cargando pedidos. Verifique conexión.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-80px)] p-4 md:p-6 lg:p-8">
      {activeOrders.length === 0 ? (
        <div className="h-[60vh] flex flex-col items-center justify-center text-slate-600">
          <UtensilsCrossed size={64} className="mb-4 opacity-20" />
          <h2 className="text-2xl font-bold text-slate-500">Todo tranquilo en la cocina</h2>
          <p className="text-slate-600">Esperando nuevos pedidos...</p>
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdateStatus={(id, status, phoneNumber) => updateStatus({ id, status, phoneNumber })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};
