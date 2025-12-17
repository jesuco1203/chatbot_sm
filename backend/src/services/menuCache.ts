import { pool } from './db';
import { MenuItem, MenuCategory } from '../data/menuTypes';

const TTL_MS = 60 * 1000; // 60s

let cachedMenu: MenuItem[] = [];
let cachedAt = 0;
let cachedMaxUpdatedAt: string | null = null;
const counters = {
  dbReadsMaxUpdatedAt: 0,
  dbReadsMenuFull: 0
};

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

export const getMenuCached = async (options: { forceReload?: boolean } = {}): Promise<MenuItem[]> => {
  const now = Date.now();
  const isFresh = now - cachedAt < TTL_MS;

  if (!options.forceReload && cachedMenu.length && isFresh) {
    return cachedMenu;
  }

  // Step 1: check max(updated_at)
  counters.dbReadsMaxUpdatedAt += 1;
  const maxRes = await pool.query<{ max: string | null }>('SELECT max(updated_at) as max FROM products WHERE is_active = true');
  const maxUpdatedAt = maxRes.rows[0]?.max ?? null;

  const hasChanged = options.forceReload || !cachedMaxUpdatedAt || maxUpdatedAt !== cachedMaxUpdatedAt;
  if (hasChanged) {
    counters.dbReadsMenuFull += 1;
    const res = await pool.query('SELECT * FROM products WHERE is_active = true');
    cachedMenu = res.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      category: row.category as MenuCategory,
      prices: normalizePrices(row.prices),
      keywords: (row.keywords as string[]) || []
    }));
    cachedMaxUpdatedAt = maxUpdatedAt;
  }

  cachedAt = now;
  return cachedMenu;
};

// Utilidad para tests
export const setMenuCacheForTests = (menu: MenuItem[]) => {
  cachedMenu = menu;
  cachedAt = Date.now();
  cachedMaxUpdatedAt = null;
};

export const getMenuCacheStats = () => ({ ...counters });
