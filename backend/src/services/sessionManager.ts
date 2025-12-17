import { pool } from './db';
import { loadEnv } from '../config/environment';
import { calculateDistance } from '../utils/geo';
import { parseAddress } from '../utils/address';
import { applyDeliveryFromCoords } from './deliveryInput';
import { getUserByPhone } from './userService';

const env = loadEnv();

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
  orderAddress?: string | null;
  delivery: {
    location: { latitude: number; longitude: number };
    distance: number;
    cost: number;
  } | null;
  pendingAddressChange: {
    location: { latitude: number; longitude: number } | null;
    distance: number;
    cost: number;
    addressText?: string;
    requestedAt: string;
    suggestedText?: string | null;
    awaitingChoice?: boolean;
  } | null;
  updatedAt: number;
  pendingRemoval: {
    awaitingNumber: boolean;
    index?: number;
  } | null;
  isDevMode?: boolean;
  hasWelcomed?: boolean;
  waitingForName?: boolean;
  waitingForAddress?: boolean;
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const freshSession = (): UserSession => ({
  cart: [],
  history: [],
  name: null,
  address: null,
  orderAddress: null,
  delivery: null, // Initialize delivery to null
  pendingAddressChange: null,
  pendingRemoval: null,
  updatedAt: Date.now(),
  isDevMode: false,
  hasWelcomed: false,
  waitingForName: false,
  waitingForAddress: false
});

const buildSessionFromUser = async (userId: string, user: { name?: string | null; address?: string | null }) => {
  const session = freshSession();
  session.name = user.name ?? null;
  if (user.address) {
    session.address = user.address;
    session.orderAddress = user.address;
    const meta = parseAddress(user.address);
    if (meta.location) {
      await applyDeliveryFromCoords(userId, { lat: meta.location.lat, lng: meta.location.lng }, session);
    }
  }
  return session;
};

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
        const user = await getUserByPhone(userId);
        if (user) {
          console.log('♻️ Prefill de sesión expirada con datos de usuario existente.');
          const prefilled = await buildSessionFromUser(userId, user);
          await saveSessionToDb(userId, prefilled);
          return prefilled;
        }
        return freshSession();
      }

      const loaded = row.data as UserSession;
      if (loaded.hasWelcomed === undefined) loaded.hasWelcomed = false;
      if (loaded.waitingForName === undefined) loaded.waitingForName = false;
      if (loaded.waitingForAddress === undefined) loaded.waitingForAddress = false;
      return loaded;
    }
    console.log('⚠️ No se encontró sesión (Usuario Nuevo o Expirado)');
    const user = await getUserByPhone(userId);
    if (user) {
      console.log('🧭 Creando sesión prefijada desde users.');
      const prefilled = await buildSessionFromUser(userId, user);
      await saveSessionToDb(userId, prefilled);
      return prefilled;
    }
  } catch (error) {
    console.error('❌ Error CRÍTICO leyendo sesión:', error);
  }
  const fresh = freshSession();
  // Persistir de inmediato la nueva sesión para no perder historial inicial
  await saveSessionToDb(userId, fresh);
  return fresh;
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
    quantity: number = 1,
    session?: UserSession
  ) {
    const targetSession = session ?? await this.getSession(userId);
    const existing = targetSession.cart.find((c) => c.id === item.id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      targetSession.cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity
      });
    }
    const shouldPersist = !session;
    if (shouldPersist) {
      await saveSessionToDb(userId, targetSession);
    }
    return targetSession;
  },

  async removeFromCart(userId: string, itemId: string, session?: UserSession) {
    const targetSession = session ?? await this.getSession(userId);
    targetSession.cart = targetSession.cart.filter((c) => c.id !== itemId);
    const shouldPersist = !session;
    if (shouldPersist) {
      await saveSessionToDb(userId, targetSession);
    }
    return targetSession;
  },

  async setDeliveryDetails(userId: string, name: string, address: string, session?: UserSession) {
    const targetSession = session ?? await this.getSession(userId);
    targetSession.name = name;

    const meta = parseAddress(address);
    // Detect coordenadas en texto si no vinieron en el JSON
    if (!meta.location) {
      const match = address.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (match) {
        meta.location = { lat: Number(match[1]), lng: Number(match[2]) };
      }
    }

    // Calcular delivery si hay coordenadas
    if (meta.location) {
      await applyDeliveryFromCoords(
        userId,
        { lat: meta.location.lat, lng: meta.location.lng },
        targetSession
      );
      targetSession.pendingAddressChange = {
        location: { latitude: meta.location.lat, longitude: meta.location.lng },
        distance: targetSession.delivery?.distance || 0,
        cost: targetSession.delivery?.cost || 0,
        requestedAt: new Date().toISOString(),
        suggestedText: meta.text || null,
        addressText: meta.text || address,
        awaitingChoice: false // falta elegir solo/guardar
      };
    } else {
      // No hay coordenadas: solo guardar dirección sugerida y marcar pendiente de elección/ubicación
      targetSession.pendingAddressChange = {
        location: null,
        distance: 0,
        cost: 0,
        requestedAt: new Date().toISOString(),
        suggestedText: meta.text || address,
        addressText: meta.text || address,
        awaitingChoice: false
      };
    }

    // No tocar address principal aquí; se decidirá con los botones
    await saveSessionToDb(userId, targetSession);
    return targetSession;
  },

  async setPendingRemoval(userId: string, pending: { awaitingNumber: boolean; index?: number } | null) {
    const session = await this.getSession(userId);
    session.pendingRemoval = pending;
    await saveSessionToDb(userId, session);
  },

  async clearCart(userId: string, session?: UserSession) {
    const targetSession = session ?? await this.getSession(userId);
    targetSession.cart = [];
    const shouldPersist = !session;
    if (shouldPersist) {
      await saveSessionToDb(userId, targetSession);
    }
    return targetSession;
  },

  async resetSession(userId: string) {
    await saveSessionToDb(userId, freshSession());
  },

  async updateSession(userId: string, newSessionData: UserSession) {
    await saveSessionToDb(userId, newSessionData);
  }
};
