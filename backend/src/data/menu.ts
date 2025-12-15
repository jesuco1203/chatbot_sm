import { pool } from '../services/db';

export type MenuCategory = 'pizza' | 'lasagna' | 'drink' | 'extra';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: MenuCategory;
  prices: Record<string, number>;
  keywords?: string[];
}

// Caché en memoria
export let MENU: MenuItem[] = [];

const normalizePrices = (prices: any): Record<string, number> => {
  if (!prices) return {};
  if (Array.isArray(prices)) {
    const obj: Record<string, number> = {};
    prices.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        Object.entries(entry).forEach(([k, v]) => {
          const num = Number(v);
          if (!Number.isNaN(num)) obj[k] = num;
        });
      }
    });
    return obj;
  }
  if (typeof prices === 'object') {
    const obj: Record<string, number> = {};
    Object.entries(prices).forEach(([k, v]) => {
      const num = Number(v);
      if (!Number.isNaN(num)) obj[k] = num;
    });
    return obj;
  }
  return {};
};

// Carga menú desde BD (llamar al iniciar)
export const loadMenuFromDb = async () => {
  try {
    console.log('🍕 Cargando menú desde la Base de Datos...');
    const res = await pool.query('SELECT * FROM products WHERE is_active = true');

    MENU = res.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      category: row.category as MenuCategory,
      prices: normalizePrices(row.prices),
      keywords: (row.keywords as string[]) || []
    }));

    console.log(`✅ Menú actualizado: ${MENU.length} productos cargados.`);
  } catch (error) {
    console.error('❌ Error cargando menú:', error);
  }
};

export const getCategories = () => {
  const labels: Record<string, string> = {
    pizza: '🍕 Pizzas',
    lasagna: '🍝 Lasagnas',
    drink: '🥤 Bebidas',
    extra: '⭐ Extras'
  };
  const activeCategories = [...new Set(MENU.map((i) => i.category))];
  return activeCategories
    .filter((c) => labels[c])
    .map((c) => ({ id: c, label: labels[c] }));
};

export const getItemsByCategory = (category: MenuCategory) => MENU.filter((item) => item.category === category);
export const getItemById = (id: string) => MENU.find((item) => item.id === id);
