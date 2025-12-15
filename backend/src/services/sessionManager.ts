import { pool } from './db';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface UserSession {
  cart: CartItem[];
  history: any[];
  name: string | null;
  address: string | null;
  delivery: {
    location: { latitude: number; longitude: number };
    distance: number;
    cost: number;
  } | null;
  updatedAt: number;
  pendingRemoval: {
    awaitingNumber: boolean;
    index?: number;
  } | null;
  isDevMode?: boolean;
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const freshSession = (): UserSession => ({
  cart: [],
  history: [],
  name: null,
  address: null,
  delivery: null, // Initialize delivery to null
  pendingRemoval: null,
  updatedAt: Date.now(),
  isDevMode: false
});

const saveSessionToDb = async (userId: string, session: UserSession) => {
  session.updatedAt = Date.now();
  try {
    await pool.query(
      `INSERT INTO sessions (phone_number, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone_number)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [userId, JSON.stringify(session)]
    );
  } catch (error) {
    console.error('Error guardando sesión:', error);
  }
};

const getSessionFromDb = async (userId: string): Promise<UserSession> => {
  try {
    console.log(`🔍 Buscando sesión en DB para: ${userId}...`);
    const res = await pool.query('SELECT data, updated_at FROM sessions WHERE phone_number = $1', [userId]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      console.log('✅ Sesión encontrada. Última actualización:', row.updated_at);
      const lastUpdate = new Date(row.updated_at).getTime();
      const now = Date.now();

      if (Number.isFinite(lastUpdate) && now - lastUpdate > SESSION_TTL_MS) {
        console.log(`🧹 Sesión de ${userId} expirada (> 6 horas). Iniciando limpia.`);
        return freshSession();
      }

      return row.data as UserSession;
    }
    console.log('⚠️ No se encontró sesión (Usuario Nuevo o Expirado)');
  } catch (error) {
    console.error('❌ Error CRÍTICO leyendo sesión:', error);
  }
  return freshSession();
};

export const sessionManager = {
  async getSession(userId: string): Promise<UserSession> {
    return getSessionFromDb(userId);
  },

  async getCart(userId: string): Promise<CartItem[]> {
    const session = await this.getSession(userId);
    return session.cart;
  },

  async addToCart(
    userId: string,
    item: { id: string; name: string; price: number },
    quantity: number = 1
  ) {
    const session = await this.getSession(userId);
    const existing = session.cart.find((c) => c.id === item.id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      session.cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity
      });
    }
    await saveSessionToDb(userId, session);
  },

  async removeFromCart(userId: string, itemId: string) {
    const session = await this.getSession(userId);
    session.cart = session.cart.filter((c) => c.id !== itemId);
    await saveSessionToDb(userId, session);
  },

  async setDeliveryDetails(userId: string, name: string, address: string) {
    const session = await this.getSession(userId);
    session.name = name;
    session.address = address;
    await saveSessionToDb(userId, session);
  },

  async setPendingRemoval(userId: string, pending: { awaitingNumber: boolean; index?: number } | null) {
    const session = await this.getSession(userId);
    session.pendingRemoval = pending;
    await saveSessionToDb(userId, session);
  },

  async clearCart(userId: string) {
    const session = await this.getSession(userId);
    session.cart = [];
    await saveSessionToDb(userId, session);
  },

  async resetSession(userId: string) {
    await saveSessionToDb(userId, freshSession());
  },

  async updateSession(userId: string, newSessionData: UserSession) {
    await saveSessionToDb(userId, newSessionData);
  }
};
