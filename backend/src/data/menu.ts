import { getMenuCached } from '../services/menuCache';
import { MenuItem, MenuCategory } from './menuTypes';

// Caché en memoria (mantener para compatibilidad interna)
export let MENU: MenuItem[] = [];

const refreshFromCache = async (options: { forceReload?: boolean } = {}) => {
  const menu = await getMenuCached(options);
  MENU = menu;
  return menu;
};

// Carga menú desde BD (llamar al iniciar)
export const loadMenuFromDb = async () => {
  try {
    console.log('🍕 Cargando menú (cache) ...');
    await refreshFromCache({ forceReload: true });
    console.log(`✅ Menú actualizado: ${MENU.length} productos cargados.`);
  } catch (error) {
    console.error('❌ Error cargando menú:', error);
  }
};

export const getCategories = async () => {
  const labels: Record<string, string> = {
    pizza: '🍕 Pizzas',
    lasagna: '🍝 Lasagnas',
    drink: '🥤 Bebidas',
    extra: '⭐ Extras'
  };
  const menu = await refreshFromCache();
  const activeCategories = [...new Set(menu.map((i) => i.category))];
  return activeCategories
    .filter((c) => labels[c])
    .map((c) => ({ id: c, label: labels[c] }));
};

export const getItemsByCategory = async (category: MenuCategory) => {
  const menu = await refreshFromCache();
  return menu.filter((item) => item.category === category);
};

export const getItemById = async (id: string) => {
  const menu = await refreshFromCache();
  return menu.find((item) => item.id === id);
};

export type { MenuItem, MenuCategory };
