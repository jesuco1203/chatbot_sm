import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Dashboard } from './components/Dashboard';
import { ProductManager } from './components/ProductManager';
import { ReportsPanel } from './components/ReportsPanel';
import { InventoryManager } from './components/InventoryManager';
import { Flame, Menu, Home, Settings, BarChart2, ClipboardList } from 'lucide-react';

const queryClient = new QueryClient();

function App() {
  const [view, setView] = useState<'kitchen' | 'admin-menu' | 'admin-reports' | 'admin-inventory'>('kitchen');
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState<'admin-menu' | 'admin-reports' | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  const requestAdminView = (next: 'admin-menu' | 'admin-reports' | 'admin-inventory') => {
    if (view === next) {
      setView('kitchen');
      return;
    }
    setPendingView(next);
    setPasscodeInput('');
    setPasscodeError('');
    setPasscodeModalOpen(true);
  };

  const handlePasscodeSubmit = () => {
    if (passcodeInput.trim().toLowerCase() === 'admin123') {
      if (pendingView) {
        setView(pendingView);
      }
      setPasscodeModalOpen(false);
      setPendingView(null);
      setPasscodeInput('');
      setPasscodeError('');
    } else {
      setPasscodeError('Clave incorrecta');
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      {/* Layout con altura fija y overflow controlado */}
      <div className="h-screen w-full bg-slate-950 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 text-slate-100 flex flex-col overflow-hidden">
        
        {/* Navbar */}
        <header className="shrink-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-white/10 h-20 flex items-center justify-between px-6 md:px-8">
          <div className="flex items-center gap-3">
            <div className="bg-kitchen-accent/20 p-2 rounded-lg text-kitchen-accent">
              <Flame size={28} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">SAN MARZANO</h1>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Kitchen Display System</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-full border border-slate-800">
                <div className="w-2 h-2 rounded-full bg-kitchen-success animate-pulse"></div>
                <span className="text-xs font-bold text-slate-400">ONLINE</span>
             </div>
             <div className="flex items-center gap-2">
               <button
                 onClick={() => setView('kitchen')}
                 className={`p-3 rounded-full transition-colors relative ${
                   view === 'kitchen' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400'
                 }`}
                 title="Inicio"
               >
                 <Home size={24} />
               </button>
               <button
                 onClick={() => requestAdminView('admin-menu')}
                 className={`p-3 rounded-full transition-colors relative ${
                   view === 'admin-menu' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400'
                 }`}
               >
                 <Settings size={24} />
               </button>
               <button
                 onClick={() => requestAdminView('admin-reports')}
                 className={`p-3 rounded-full transition-colors relative ${
                   view === 'admin-reports' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400'
                 }`}
               >
                 <BarChart2 size={24} />
               </button>
               <button
                 onClick={() => requestAdminView('admin-inventory')}
                 className={`p-3 rounded-full transition-colors relative ${
                   view === 'admin-inventory' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400'
                 }`}
               >
                 <ClipboardList size={24} />
               </button>
             </div>
             <button className="p-3 hover:bg-white/5 rounded-full text-slate-400 transition-colors md:hidden">
               <Menu size={24} />
             </button>
          </div>
        </header>

        {/* Contenido principal: único scroll */}
        <main className="flex-1 overflow-y-auto scroll-smooth p-4 md:p-6 lg:p-8">
          {view === 'kitchen' && <Dashboard />}
          {view === 'admin-menu' && <ProductManager />}
          {view === 'admin-reports' && <ReportsPanel onBack={() => setView('kitchen')} />}
          {view === 'admin-inventory' && <InventoryManager onBack={() => setView('kitchen')} />}
        </main>
        
        {/* Notifications */}
        <Toaster 
          position="bottom-right" 
          theme="dark" 
          richColors 
          toastOptions={{
            style: { background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }
          }} 
        />

        {passcodeModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">Acceso administrativo</h3>
              <p className="text-sm text-slate-400 mb-4">Ingresa la clave para continuar.</p>
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white mb-3"
                autoFocus
              />
              {passcodeError && <p className="text-sm text-red-400 mb-2">{passcodeError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setPasscodeModalOpen(false);
                    setPendingView(null);
                    setPasscodeInput('');
                    setPasscodeError('');
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePasscodeSubmit}
                  className="px-3 py-2 rounded-lg bg-kitchen-accent text-white hover:bg-orange-600"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}

export default App;
