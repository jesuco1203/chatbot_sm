import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  cost: number;
}

export const InventoryManager = ({ onBack }: { onBack: () => void }) => {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [movement, setMovement] = useState<{ id: string; type: 'purchase' | 'waste'; qty: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) throw new Error('Error al cargar inventario');
      setItems(await res.json());
    } catch {
      toast.error('No se pudo cargar el inventario');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing)
      });
      if (!res.ok) throw new Error();
      toast.success('Ingrediente guardado');
      setEditing(null);
      load();
    } catch {
      toast.error('Error al guardar ingrediente');
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movement) return;
    try {
      const res = await fetch('/api/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: movement.id,
          type: movement.type,
          quantity: Number(movement.qty),
          reason: movement.type === 'purchase' ? 'Compra Manual' : 'Merma/Ajuste'
        })
      });
      if (!res.ok) throw new Error();
      toast.success('Stock actualizado');
      setMovement(null);
      load();
    } catch {
      toast.error('No se pudo registrar el movimiento');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition">
            <ArrowLeft />
          </button>
          <h1 className="text-3xl font-bold text-white">Inventario</h1>
        </div>
        <button
          onClick={() => setEditing({ id: '', name: '', unit: 'kg', stock: 0, min_stock: 5, cost: 0 })}
          className="bg-kitchen-accent hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={20} /> Nuevo Insumo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-lg">{item.name}</h3>
                {Number(item.stock) <= Number(item.min_stock) && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle size={12} /> Bajo Stock
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm">
                Stock:{' '}
                <span className="text-white font-mono font-bold">
                  {Number(item.stock).toFixed(2)} {item.unit}
                </span>
                <span className="mx-2">|</span>
                Mín: {item.min_stock}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMovement({ id: item.id, type: 'purchase', qty: '' })}
                className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                title="Registrar Compra"
              >
                <TrendingUp size={20} />
              </button>
              <button
                onClick={() => setMovement({ id: item.id, type: 'waste', qty: '' })}
                className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                title="Registrar Merma"
              >
                <TrendingDown size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 p-6 rounded-xl w-full max-w-md border border-slate-700 space-y-4"
          >
            <h2 className="text-xl font-bold text-white">Detalles de Insumo</h2>
            <input
              placeholder="ID (ej. harina)"
              value={editing.id}
              onChange={(e) => setEditing({ ...editing, id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
              disabled={items.some((i) => i.id === editing.id && editing.id !== '')}
            />
            <input
              placeholder="Nombre"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                placeholder="Unidad (kg, lt)"
                value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
              />
              <input
                type="number"
                placeholder="Stock Mínimo"
                value={editing.min_stock}
                onChange={(e) => setEditing({ ...editing, min_stock: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-slate-400">
                Cancelar
              </button>
              <button type="submit" className="bg-kitchen-accent px-4 py-2 rounded text-white font-bold">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {movement && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleMovement}
            className="bg-slate-900 p-6 rounded-xl w-full max-w-sm border border-slate-700 space-y-4"
          >
            <h2 className="text-xl font-bold text-white">
              {movement.type === 'purchase' ? '🛒 Registrar Compra' : '🗑️ Registrar Merma'}
            </h2>
            <input
              type="number"
              autoFocus
              placeholder="Cantidad"
              value={movement.qty}
              onChange={(e) => setMovement({ ...movement, qty: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white text-lg"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMovement(null)} className="px-4 py-2 text-slate-400">
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded text-white font-bold ${
                  movement.type === 'purchase' ? 'bg-green-600' : 'bg-red-600'
                }`}
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
