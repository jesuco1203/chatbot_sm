import React, { useEffect, useState } from 'react';
import { ArrowLeft, DollarSign, ShoppingBag, XCircle, CheckCircle, Calendar, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

interface StatsSummary {
  revenue: number;
  completedOrders: number;
  cancelledOrders: number;
}

interface HistoryOrder {
  id: string;
  orderCode?: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
  itemCount: number;
}

interface RangeReport {
  summary: StatsSummary;
  orders: HistoryOrder[];
}

export const ReportsPanel = ({ onBack }: { onBack: () => void }) => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState<RangeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/range?start=${startDate}&end=${endDate}`);
      if (!res.ok) {
        throw new Error('Error al obtener reporte');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
        console.error(e);
        setError('No se pudo generar el reporte. Intenta nuevamente.');
        toast.error('No se pudo generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const exportToCSV = () => {
    if (!data || !data.orders.length) {
      toast.error('No hay datos para exportar');
      return;
    }
    const headers = ['ID Pedido', 'Fecha', 'Hora', 'Cliente', 'Items', 'Total (S/.)', 'Estado'];
    const rows = data.orders.map((order) => {
      const date = new Date(order.createdAt);
      return [
        order.orderCode || order.id,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        `"${order.customerName}"`,
        order.itemCount,
        order.total.toFixed(2),
        order.status
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_ventas_${startDate}_al_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Reporte descargado con éxito 📥');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition">
              <ArrowLeft />
            </button>
          <h1 className="text-3xl font-bold text-white">Reporte de Ventas</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 px-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent outline-none text-sm text-white w-32"
              />
            </div>
            <span className="text-slate-600">-</span>
            <div className="flex items-center gap-2 px-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent outline-none text-sm text-white w-32"
              />
            </div>
            <button
              onClick={fetchReport}
              className="bg-kitchen-accent hover:bg-orange-600 text-white p-2 rounded-md transition"
              title="Filtrar"
            >
              <Search size={18} />
            </button>
          </div>

          <button
            onClick={exportToCSV}
            disabled={!data?.orders.length}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold shadow-lg transition"
          >
            <Download size={20} /> Exportar Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500 animate-pulse">Generando reporte...</div>
      ) : error ? (
        <div className="text-center py-10 text-red-400">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-10">
                <DollarSign size={100} />
              </div>
              <h3 className="text-slate-400 text-sm font-medium uppercase">Ingresos (Entregados)</h3>
              <p className="text-4xl font-bold text-green-400 mt-2">
                S/. {data?.summary.revenue.toFixed(2) ?? '0.00'}
              </p>
            </div>
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-10">
                <ShoppingBag size={100} />
              </div>
              <h3 className="text-slate-400 text-sm font-medium uppercase">Pedidos Completados</h3>
              <p className="text-4xl font-bold text-blue-400 mt-2">{data?.summary.completedOrders ?? 0}</p>
            </div>
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <h3 className="text-slate-400 text-sm font-medium uppercase mb-4">Efectividad</h3>
              <div className="flex justify-between mb-2">
                <span className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-500" /> Entregados
                </span>
                <span className="font-bold">{data?.summary.completedOrders ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-2">
                  <XCircle size={14} className="text-red-500" /> Cancelados
                </span>
                <span className="font-bold">{data?.summary.cancelledOrders ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Detalle de Movimientos</h2>
              <span className="text-xs text-slate-500 font-mono">
                Mostrando {data?.orders.length ?? 0} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 uppercase">
                  <tr>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Monto</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(data?.orders || []).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-800/50 transition">
                      <td className="p-4 font-mono text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString()}{' '}
                        <br />
                        <span className="text-xs opacity-50">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-white">
                        <div className="font-mono text-xs text-slate-400">{order.orderCode || order.id}</div>
                        <div>{order.customerName}</div>
                      </td>
                      <td className="p-4 font-bold text-green-400">S/. {order.total.toFixed(2)}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-bold ${
                            order.status === 'delivered'
                              ? 'bg-green-500/20 text-green-400'
                              : order.status === 'cancelled'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
