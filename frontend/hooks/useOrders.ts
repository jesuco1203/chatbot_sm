import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOrders, updateOrderStatus } from '../services/api';
import { Order, OrderStatus } from '../types';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

// Sound effect utility
const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(650, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(950, audioContext.currentTime + 0.6);
    
    gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + 1.5);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1.6);
    
    // Close context after sound prevents memory leak / max context limit
    setTimeout(() => {
        if(audioContext.state !== 'closed') {
            audioContext.close().catch(console.error);
        }
    }, 600);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

export const useOrders = () => {
  const queryClient = useQueryClient();
  const previousOrderCount = useRef<number>(0);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDeliveredRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Sound effect logic: Play ding when new orders arrive
  useEffect(() => {
    if (query.data) {
      const currentCount = query.data.length;
      // If we have more orders than before (and it's not the initial load), play sound
      if (currentCount > previousOrderCount.current && previousOrderCount.current !== 0) {
        playNotificationSound();
        toast.info("¡Nuevo Pedido Recibido!", { duration: 4000 });
      }
      previousOrderCount.current = currentCount;

      // Alarma persistente mientras haya pedidos confirmados pendientes
      const hasPending = query.data.some((o) => o.status === 'confirmed');
      if (hasPending && !alarmIntervalRef.current) {
        alarmIntervalRef.current = setInterval(() => {
          playNotificationSound();
        }, 4000);
      }
      if (!hasPending && alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }

      // Auto-entregar pedidos en ruta después de 30 minutos
      query.data.forEach((order) => {
        if (order.status === 'out_for_delivery') {
          const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
          if (elapsed >= 30 && !autoDeliveredRef.current.has(order.id)) {
            autoDeliveredRef.current.add(order.id);
            updateStatusMutation.mutate({ id: order.id, status: 'delivered', phoneNumber: order.phoneNumber });
          }
        }
      });
    }
  }, [query.data]);

  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, []);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, phoneNumber }: { id: string; status: OrderStatus; phoneNumber?: string }) => 
      updateOrderStatus(id, status, phoneNumber),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      const previousOrders = queryClient.getQueryData<Order[]>(['orders']);

      queryClient.setQueryData<Order[]>(['orders'], (old) => {
        if (!old) return [];
        return old.map((order) => 
          order.id === id ? { ...order, status } : order
        );
      });

      return { previousOrders };
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['orders'], context?.previousOrders);
      toast.error("Error al actualizar estado");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onSuccess: (data) => {
      const statusMessages: Record<string, string> = {
        preparing: 'En preparación 🔥',
        ready: 'Listo para entrega 🥡',
        out_for_delivery: 'En camino 🛵',
        delivered: 'Entregado ✅',
      };
      toast.success(`Pedido ${data.id}: ${statusMessages[data.status] || 'Actualizado'}`);
    }
  });

  return {
    orders: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    updateStatus: updateStatusMutation.mutate,
  };
};
