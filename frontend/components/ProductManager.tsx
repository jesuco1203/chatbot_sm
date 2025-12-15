import React, { useEffect, useMemo, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { Product, ProductCategory } from '../types';
import { Loader2, Save, X, Trash2, ClipboardList, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchIngredients, fetchRecipe, saveIngredient, saveRecipe } from '../services/api';
import { toast } from 'sonner';

const CATEGORY_OPTIONS: { id: ProductCategory; label: string }[] = [
  { id: 'pizza', label: '🍕 Pizza' },
  { id: 'lasagna', label: '🍝 Lasagna' },
  { id: 'drink', label: '🥤 Bebida' },
  { id: 'extra', label: '⭐ Extra' }
];

const emptyProduct: Product = {
  id: '',
  name: '',
  description: '',
  category: 'pizza',
  prices: {},
  keywords: [],
  isActive: true
};

export const ProductManager: React.FC = () => {
  const { products, isLoading, isError, saveProduct, deleteProduct } = useProducts();
  const [selected, setSelected] = useState<Product>(emptyProduct);
  const [priceKey, setPriceKey] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [recipeModal, setRecipeModal] = useState<Product | null>(null);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [newIngId, setNewIngId] = useState('');
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('kg');

  const sorted = useMemo(
    () =>
      [...products].sort((a, b) => {
        if ((a.isActive ?? true) !== (b.isActive ?? true)) {
          return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
        }
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      }),
    [products]
  );

  const handleSelect = (product: Product) => {
    setSelected({ ...product, keywords: product.keywords || [] });
    setPriceKey('');
    setPriceValue('');
  };

  const handleAddPrice = () => {
    if (!priceKey) return;
    const value = Number(priceValue);
    if (Number.isNaN(value)) return;
    setSelected((prev) => ({
      ...prev,
      prices: { ...(prev.prices || {}), [priceKey]: value }
    }));
    setPriceKey('');
    setPriceValue('');
  };

  const handleRemovePrice = (key: string) => {
    setSelected((prev) => {
      const next = { ...(prev.prices || {}) };
      delete next[key];
      return { ...prev, prices: next };
    });
  };

  const handleSave = () => {
    if (!selected.id || !selected.name) return;
    saveProduct({
      ...selected,
      keywords: (selected.keywords || []).map((k) => k.trim()).filter(Boolean)
    });
  };

  const openRecipe = async (product: Product) => {
    setRecipeModal(product);
    if (ingredients.length === 0) {
      try {
        const ing = await fetchIngredients();
        setIngredients(ing);
      } catch {
        setIngredients([]);
      }
    }
    try {
      const recipe = await fetchRecipe(product.id);
      setRecipeItems(recipe || []);
    } catch {
      setRecipeItems([]);
    }
    setSelectedIngredient('');
    setQuantityInput('');
  };

  const addRecipeItem = () => {
    if (!selectedIngredient) return;
    const qty = Number(quantityInput);
    if (Number.isNaN(qty) || qty <= 0) return;
    setRecipeItems((prev) => {
      const exists = prev.find((r) => r.ingredient_id === selectedIngredient);
      if (exists) {
        return prev.map((r) => (r.ingredient_id === selectedIngredient ? { ...r, quantity: qty } : r));
      }
      return [...prev, { ingredient_id: selectedIngredient, quantity: qty }];
    });
    setSelectedIngredient('');
    setQuantityInput('');
  };

  const removeRecipeItem = (id: string) => {
    setRecipeItems((prev) => prev.filter((r) => r.ingredient_id !== id));
  };

  const handleSaveRecipe = async () => {
    if (!recipeModal) return;
    await saveRecipe(
      recipeModal.id,
      recipeItems.map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) }))
    );
    setRecipeModal(null);
    setRecipeItems([]);
    toast.success('Receta guardada');
  };

  const handleCreateIngredient = async () => {
    if (!newIngId || !newIngName) return;
    try {
      await saveIngredient({
        id: newIngId,
        name: newIngName,
        unit: newIngUnit || 'kg',
        cost: 0,
        stock: 0,
        min_stock: 0
      });
      const ing = await fetchIngredients();
      setIngredients(ing);
      setNewIngId('');
      setNewIngName('');
      setNewIngUnit('kg');
      toast.success('Ingrediente creado');
    } catch {
      toast.error('No se pudo crear el ingrediente');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center text-slate-400 gap-3">
        <Loader2 className="h-6 w-6 animate-spin" /> Cargando productos...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center text-red-400">
        Error al cargar productos.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
      <div className="lg:col-span-1 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-800">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Productos</h2>
          <p className="text-sm text-slate-400">Selecciona un ítem para editarlo.</p>
        </div>
        <div className="divide-y divide-slate-800">
          {sorted.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${
                selected.id === product.id ? 'bg-white/5' : ''
              }`}
            >
              <div className="text-sm font-bold text-white flex justify-between items-center">
                <span className={`${product.isActive === false ? 'opacity-50' : ''}`}>{product.name}</span>
                <div className="flex items-center gap-2">
                  {product.isActive === false && (
                    <span className="text-[10px] uppercase tracking-wide text-red-400 bg-red-900/30 border border-red-900/60 px-2 py-0.5 rounded-full">
                      Inactivo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRecipe(product);
                    }}
                    className="px-2 py-1 text-xs bg-slate-800 text-slate-200 rounded hover:bg-slate-700 flex items-center gap-1"
                  >
                    <ClipboardList size={14} /> Receta
                  </button>
                  <span className="text-xs rounded-full px-2 py-1 bg-slate-800 text-slate-300">{product.category}</span>
                </div>
              </div>
              <p className={`text-xs text-slate-400 line-clamp-2 ${product.isActive === false ? 'opacity-60' : ''}`}>
                {product.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 bg-slate-900/40 rounded-xl border border-slate-800 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Editar producto</h2>
            <p className="text-sm text-slate-400">Actualiza precios, descripción y keywords.</p>
          </div>
          <div className="flex gap-2">
            {selected.id && (
              <button
                onClick={() => {
                  if (window.confirm('¿Eliminar este producto?')) {
                    deleteProduct(selected.id);
                    setSelected(emptyProduct);
                    setPriceKey('');
                    setPriceValue('');
                  }
                }}
                className="px-3 py-2 rounded-lg border border-red-500/60 text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              >
                <Trash2 size={16} /> Eliminar
              </button>
            )}
            <button
              onClick={() => {
                setSelected(emptyProduct);
                setPriceKey('');
                setPriceValue('');
              }}
              className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-white/5 flex items-center gap-2"
            >
              <X size={16} /> Nuevo
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-2 rounded-lg bg-kitchen-accent text-white hover:bg-orange-600 flex items-center gap-2"
            >
              <Save size={16} /> Guardar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            ID (único)
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              value={selected.id}
              onChange={(e) => setSelected((p) => ({ ...p, id: e.target.value }))}
              placeholder="hawaiana"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Categoría
            <select
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              value={selected.category}
              onChange={(e) => setSelected((p) => ({ ...p, category: e.target.value as ProductCategory }))}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">
            Nombre
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              value={selected.name}
              onChange={(e) => setSelected((p) => ({ ...p, name: e.target.value }))}
              placeholder="Pizza Hawaiana"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">
            Descripción
            <textarea
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white min-h-[80px]"
              value={selected.description}
              onChange={(e) => setSelected((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descripción breve del producto"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
            <input
              type="checkbox"
              checked={selected.isActive ?? true}
              onChange={(e) => setSelected((p) => ({ ...p, isActive: e.target.checked }))}
            />
            Producto activo
          </label>
        </div>

        <div className="mt-6">
          <h3 className="text-white font-bold mb-2">Precios</h3>
          <div className="flex gap-2 mb-3">
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              placeholder="Tamaño (ej. Grande)"
              value={priceKey}
              onChange={(e) => setPriceKey(e.target.value)}
            />
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              placeholder="Precio (ej. 34)"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
            />
            <button
              onClick={handleAddPrice}
              className="px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600"
            >
              Añadir
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(selected.prices || {}).map(([size, price]) => (
              <div
                key={size}
                className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                <span className="text-sm font-bold">{size}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200">S/. {price}</span>
                  <button
                    onClick={() => handleRemovePrice(size)}
                    className="text-slate-400 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-white font-bold mb-2">Palabras clave</h3>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            value={(selected.keywords || []).join(', ')}
            onChange={(e) =>
              setSelected((p) => ({ ...p, keywords: e.target.value.split(',').map((k) => k.trim()) }))
            }
            placeholder="ej: dulce, piña, ahumado"
          />
        </div>

        <AnimatePresence>
          {Object.keys(selected.prices || {}).length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-sm text-kitchen-danger"
            >
              Agrega al menos un precio para guardar.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {recipeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Receta: {recipeModal.name}</h3>
              <button
                onClick={() => setRecipeModal(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-sm text-slate-300">Ingrediente</label>
                <select
                  value={selectedIngredient}
                  onChange={(e) => setSelectedIngredient(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Selecciona ingrediente</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">Cantidad</label>
                <input
                  type="number"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  placeholder="0.300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={addRecipeItem}
                className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 flex items-center gap-2"
              >
                <Plus size={16} /> Añadir
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 max-h-64 overflow-y-auto">
              {recipeItems.length === 0 && <p className="text-sm text-slate-400">Sin ingredientes aún.</p>}
              {recipeItems.map((r) => {
                const ing = ingredients.find((i) => i.id === r.ingredient_id);
                const name = ing?.name || r.ingredient_id;
                const unit = ing?.unit || '';
                return (
                  <div
                    key={r.ingredient_id}
                    className="flex justify-between items-center py-2 border-b border-slate-700 last:border-b-0"
                  >
                    <div>
                      <p className="text-white font-medium">{name}</p>
                      <p className="text-xs text-slate-400">
                        {Number(r.quantity)} {unit}
                      </p>
                    </div>
                    <button
                      onClick={() => removeRecipeItem(r.ingredient_id)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-700 pt-3">
              <h4 className="text-sm font-bold text-white mb-2">Crear ingrediente rápido</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  placeholder="ID"
                  value={newIngId}
                  onChange={(e) => setNewIngId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <input
                  placeholder="Nombre"
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <input
                  placeholder="Unidad"
                  value={newIngUnit}
                  onChange={(e) => setNewIngUnit(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <button
                  onClick={handleCreateIngredient}
                  className="px-3 py-2 bg-kitchen-accent text-white rounded-lg hover:bg-orange-600"
                  type="button"
                >
                  Crear insumo
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRecipeModal(null)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveRecipe}
                className="px-4 py-2 bg-kitchen-accent text-white rounded-lg hover:bg-orange-600"
              >
                Guardar Receta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
