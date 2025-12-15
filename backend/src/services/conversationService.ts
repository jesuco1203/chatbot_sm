export type ConversationState =
  | 'menu_principal'
  | 'seleccionando_categoria'
  | 'seleccionando_producto'
  | 'seleccionando_tamano'
  | 'viendo_carrito'
  | 'confirmando_pedido';

export interface ConversationCustomer {
  phone: string;
  name?: string;
  email?: string;
  address?: string;
  isNew: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
}

export interface ConversationContext {
  phoneNumber: string;
  state: ConversationState;
  selectedCategory?: string;
  pendingProductId?: string | undefined;
  pendingSizeOptions?: string[] | undefined;
  pendingConfirmation?: {
    productId: string;
    sizeHint?: string;
    quantity?: number;
  } | null;
  pendingRemoval?: {
    awaitingNumber?: boolean;
    index?: number;
  } | null;
  cart: Array<{
    productId: string;
    name: string;
    size?: string;
    quantity: number;
    unitPrice: number;
  }>;
  customer?: ConversationCustomer;
  chatHistory: ConversationMessage[];
  chatSessionId?: string;
  updatedAt: number;
  welcomeSent?: boolean;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, ConversationContext>();

export const getSession = (phone: string): ConversationContext => {
  const existing = sessions.get(phone);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    return existing;
  }

  const fresh: ConversationContext = {
    phoneNumber: phone,
    state: 'menu_principal',
    cart: [],
    chatHistory: [],
    updatedAt: Date.now(),
    welcomeSent: false
  };
  sessions.set(phone, fresh);
  return fresh;
};

export const updateSession = (phone: string, patch: Partial<ConversationContext>) => {
  const session = getSession(phone);
  const updated = { ...session, ...patch, updatedAt: Date.now() };
  sessions.set(phone, updated);
  return updated;
};

export const resetSession = (phone: string) => {
  sessions.delete(phone);
};
