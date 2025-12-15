import { GoogleGenAI, FunctionCall } from '@google/genai';
import { loadEnv } from '../config/environment';
import { toolDeclarations, searchMenuTool } from './tools';
import { getSystemInstruction, WELCOME_MESSAGE } from './instructions';
import { sessionManager, UserSession } from '../services/sessionManager';
import { getItemById, MenuCategory } from '../data/menu';
import { createOrder, getLastOrderStatus } from '../services/orderService';
import { getUserByPhone, upsertUser } from '../services/userService';
import { sendWhatsappMessage } from '../services/whatsappService';
import { detectCategoryFromText, searchMenu } from '../services/productSearch';

const env = loadEnv();
const aiClient = new GoogleGenAI({ apiKey: env.geminiApiKey });

type ChatSession = ReturnType<typeof aiClient.chats.create>;

const chatSessions = new Map<string, ChatSession>();

const getChatSession = (phone: string, previousHistory: any[] = []) => {
  if (!chatSessions.has(phone)) {
    const session = aiClient.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: getSystemInstruction(),
        tools: [{ functionDeclarations: toolDeclarations }],
        temperature: 0.5
      },
      history: previousHistory
    });
    chatSessions.set(phone, session);
  }
  return chatSessions.get(phone)!;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sendMessageWithRetry = async (chatSession: ChatSession, payload: any, attempts = 0): Promise<any> => {
  const maxAttempts = 3;
  try {
    return await chatSession.sendMessage(payload);
  } catch (error: any) {
    console.error('>>> GEMINI ERROR:', error);
    const shouldRetry =
      attempts + 1 < maxAttempts &&
      (
        error?.status === 429 ||
        error?.code === 429 ||
        (typeof error?.message === 'string' &&
          (error.message.includes('429') ||
            error.message.includes('RESOURCE_EXHAUSTED') ||
            error.message.includes('quota')))
      );

    if (shouldRetry) {
      await delay(2000 * (attempts + 1));
      return sendMessageWithRetry(chatSession, payload, attempts + 1);
    }
    throw error;
  }
};

interface ToolExecutionResult {
  response: string;
  meta?: {
    showMenu?: boolean;
    showCategory?: MenuCategory;
    showCart?: boolean;
    cartUpdated?: boolean;
    deliveryUpdated?: boolean;
    confirmationMessage?: string;
    stopConversation?: boolean;
  };
}

const handleAddToCart = async (phone: string, args: Record<string, any>): Promise<ToolExecutionResult> => {
  const product = getItemById(args.itemId);
  if (!product) {
    return { response: JSON.stringify({ status: 'error', message: 'Producto no encontrado.' }) };
  }

  if ((product.category === 'pizza' || product.category === 'drink') && !args.size) {
    return {
      response: JSON.stringify({
        status: 'need_size',
        message: 'Falta el tamaño.',
        sizes: Object.keys(product.prices)
      }),
      meta: { cartUpdated: false }
    };
  }

  const size = args.size as string | undefined;
  const priceForSize = size ? product.prices[size] : undefined;
  if (size && priceForSize === undefined) {
    return { response: JSON.stringify({ status: 'error', message: 'Tamaño no disponible.' }) };
  }

  const unitPrice = priceForSize ?? Object.values(product.prices)[0] ?? 0;

  const quantity = Number(args.quantity) || 1;
  await sessionManager.addToCart(phone, { id: product.id, name: product.name, price: unitPrice }, quantity);

  return {
    response: JSON.stringify({
      status: 'success',
      message: `${quantity} x ${product.name}${size ? ` (${size})` : ''} añadidos al carrito.`
    }),
    meta: { cartUpdated: true }
  };
};

const handleRemoveFromCart = async (phone: string, args: Record<string, any>): Promise<ToolExecutionResult> => {
  const session = await sessionManager.getSession(phone);
  const targetId = (args.itemId as string).toLowerCase();

  const itemToRemove = session.cart.find(item => item.id.toLowerCase() === targetId);

  if (itemToRemove) {
    await sessionManager.removeFromCart(phone, itemToRemove.id);
    return {
      response: JSON.stringify({
        status: 'success',
        message: 'Ítems eliminados del carrito.'
      }),
      meta: { cartUpdated: true }
    };
  } else {
    return {
      response: JSON.stringify({
        status: 'error',
        message: 'No se encontró el producto indicado.'
      }),
      meta: { cartUpdated: false }
    };
  }
};

const handleConfirmOrder = async (phone: string): Promise<ToolExecutionResult> => {
  const session = await sessionManager.getSession(phone);
  const { name, address } = session;

  if (!name || !address) {
    return {
      response: JSON.stringify({
        status: 'pending_data',
        message: 'Faltan datos del cliente.'
      })
    };
  }

  if (session.cart.length === 0) {
    return {
      response: JSON.stringify({
        status: 'error',
        message: 'El carrito está vacío.'
      })
    };
  }

  const total = session.cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const orderItems = session.cart.map((item) => ({
    productId: item.id,
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.price
  }));

  const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const summaryLines = session.cart.map(
    (item) => `• ${item.quantity}x ${item.name} (${currency.format(item.price * item.quantity)})`
  );
  const totalLine = `💰 Total: ${currency.format(total)}`;
  const addressLine = address ? `📍 Entrega: ${address}` : '';
  const nameLine = name ? `👤 Cliente: ${name}` : '';

  // Asegurar que el usuario exista antes de crear la orden (FK en orders)
  await upsertUser({
    phoneNumber: phone,
    name,
    address,
    email: null
  });

  const order = await createOrder({
    phoneNumber: phone,
    source: 'whatsapp',
    items: orderItems,
    total,
    status: 'confirmed'
  });

  const confirmationMessage = [
    '🙌 ¡Pedido confirmado! Gracias por tu compra.',
    order.orderCode ? `🧾 Pedido: ${order.orderCode}` : order.orderId ? `🧾 Pedido: ${order.orderId}` : '',
    ...summaryLines,
    totalLine,
    addressLine,
    nameLine
  ]
    .filter(Boolean)
    .join('\n');

  await sessionManager.clearCart(phone);
  await sessionManager.resetSession(phone);

  return {
    response: JSON.stringify({
      status: 'confirmed',
      orderId: order.orderId,
      orderCode: order.orderCode,
      total,
      summary: session.cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity
      })),
      address: session.address,
      name: session.name
    }),
    meta: { confirmationMessage, stopConversation: true }
  };
};

const executeToolCall = async (phone: string, call: FunctionCall): Promise<ToolExecutionResult> => {
  switch (call.name) {
    case 'showCart':
      return { response: JSON.stringify({ status: 'success' }), meta: { showCart: true } };
    case 'getMenu':
      return { response: JSON.stringify({ status: 'success' }), meta: { showMenu: true } };
    case 'getMenuItems':
      if (call.args) {
        return { response: JSON.stringify({ status: 'success' }), meta: { showCategory: call.args.categoryId as MenuCategory } };
      }
      return { response: JSON.stringify({ status: 'error', message: 'Missing arguments' }) };
    case 'searchMenu':
      if (call.args) {
        const results = await searchMenuTool({
          query: call.args.query as string,
          category: call.args.category as MenuCategory,
          exclude: call.args.exclude as string[]
        });
        return {
          response: JSON.stringify({
            status: 'success',
            count: results.length,
            results
          })
        };
      }
      return { response: JSON.stringify({ status: 'error', message: 'Missing arguments' }) };
    case 'addToCart':
      return handleAddToCart(phone, call.args || {});
    case 'removeFromCart':
      return handleRemoveFromCart(phone, call.args || {});
    case 'setDeliveryDetails':
      if (call.args) {
        await sessionManager.setDeliveryDetails(phone, call.args.name as string, call.args.address as string);
        return { response: JSON.stringify({ status: 'success' }), meta: { deliveryUpdated: true } };
      }
      return { response: JSON.stringify({ status: 'error', message: 'Missing arguments' }) };
    case 'confirmOrder':
      return handleConfirmOrder(phone);
    case 'checkOrderStatus': {
      const lastOrder = await getLastOrderStatus(phone);
      if (!lastOrder) {
        return { response: JSON.stringify({ status: 'error', message: 'No tienes pedidos recientes.' }) };
      }
      const statusMap: Record<string, string> = {
        confirmed: '✅ Confirmado (En cola)',
        preparing: '🔥 En el horno',
        ready: '🥡 Listo para enviar',
        out_for_delivery: '🛵 En camino',
        delivered: '🏠 Entregado'
      };
      const friendlyStatus = statusMap[lastOrder.status] || lastOrder.status;
      return {
        response: JSON.stringify({
          status: 'success',
          message: `Tu pedido (ID: ...${String(lastOrder.orderId).slice(-4)}) está: ${friendlyStatus}`
        })
      };
    }
    default:
      return { response: JSON.stringify({ status: 'error', message: 'Función desconocida' }) };
  }
};

export interface NaturalMessageResult {
  replies: string[];
  showMenu: boolean;
  categoryToShow?: MenuCategory;
  cartUpdated?: boolean;
  deliveryUpdated?: boolean;
  handled: boolean;
  showCart?: boolean;
  needsFallback?: boolean;
}

const buildStateContext = (session: UserSession) => {
  const lines: string[] = [];
  const { name, address } = session;
  if (name && address) {
    lines.push(
      `Cliente registrado: ${name}${ 
        address ? ` - ${address}` : ''
      }`
    );
  } else {
    lines.push('Cliente nuevo detectado. Solicita nombre completo y dirección antes de confirmar.');
  }

  if (session.cart.length > 0) {
    const cartSummary = session.cart
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.name} x${item.quantity} - S/${(
            item.price * item.quantity
          ).toFixed(2)}`
      )
      .join('\n');
    lines.push('Carrito actual:', cartSummary);
  } else {
    lines.push('Carrito actual vacío.');
  }

  if (session.name && session.address && session.cart.length > 0) {
    lines.push('');
    lines.push('--- ESTADO CRÍTICO DEL PEDIDO ---');
    lines.push('✅ DATOS COMPLETOS: Tienes nombre, dirección y productos listos.');
    lines.push(
      '⚠️ INSTRUCCIÓN PRIORITARIA: Si el usuario dice "sí", "ok", "confirmar" o "envíalo", EJECUTA LA HERRAMIENTA confirmOrder INMEDIATAMENTE. No vuelvas a preguntar ni a resumir.'
    );
  }

  return lines.join('\n');
};

export const processNaturalMessage = async (
  phone: string,
  text: string
): Promise<NaturalMessageResult> => {
  const replies: string[] = [];
  let showMenu = false;
  let categoryToShow: MenuCategory | undefined;
  let cartUpdated = false;
  let deliveryUpdated = false;
  let pendingSizePrompt = false;
  let skipModelText = false;
  let stopAfterTools = false;
  let showCart = false;
  let sessionWasReset = false;
  let botUsedTool = false;

  let sessionSnapshot = await sessionManager.getSession(phone);
  const isFirstInteraction = sessionSnapshot.history.length === 0;
  try {
    const existingUser = await getUserByPhone(phone);
    if (existingUser) {
      const session = await sessionManager.getSession(phone);
      if (existingUser.name && !session.name) {
        session.name = existingUser.name;
      }
      if (existingUser.address && !session.address) {
        session.address = existingUser.address;
      }
      sessionSnapshot = session;
      await sessionManager.updateSession(phone, session);
    }
  } catch (err) {
    console.error('>>> USER LOOKUP ERROR:', err);
  }

  const geminiHistory = (sessionSnapshot.history || []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: h.parts
  }));
  const chat = getChatSession(phone, geminiHistory);

  const context = buildStateContext(sessionSnapshot);
  let augmentedText = '';

  if (sessionSnapshot.isDevMode) {
    const debugInfo = JSON.stringify(
      {
        cartSize: sessionSnapshot.cart.length,
        cartItems: sessionSnapshot.cart.map((i) => i.name),
        userData: { name: sessionSnapshot.name, address: sessionSnapshot.address },
        historyCount: sessionSnapshot.history.length,
        lastMsg: text
      },
      null,
      2
    );

    augmentedText = `
🚨 MODO DEBUG ACTIVO 🚨
El usuario es el DESARROLLADOR. NO actúes como vendedor.
TU TAREA:
1. Analiza el mensaje del usuario: "${text}"
2. Dime qué "Tool" llamarías en una situación normal y por qué.
3. Si hay errores en los datos, señálalos.
4. Sé breve y técnico.

DATOS INTERNOS ACTUALES:
${debugInfo}
`;
  } else {
    augmentedText = `Número detectado: +${phone}\n${context}\n\nUsuario dice: ${text}`;
  }

  console.log('🤖 [GEMINI] 🧠 Analizando contexto...');
  // console.log(augmentedText); // Descomenta si quieres ver TODO el prompt (mucho texto)
  let result = await sendMessageWithRetry(chat, { message: [{ text: augmentedText }] });
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║ 🤖 GEMINI DECISIÓN                               ║');
  if (result.text) {
  console.log(`║ 🗣️  Respuesta: "${result.text.replace(/\\n/g, ' ').substring(0, 50)}..."`);
  }
  
  if (result.functionCalls && result.functionCalls.length > 0) {
      console.log('║ 🛠️  TOOLS INVOCADAS:                             ║');
      result.functionCalls.forEach((fc: any) => {
          console.log(`║    👉 ${fc.name.padEnd(15)} Args: ${JSON.stringify(fc.args)}`);
      });
  } else {
      console.log('║ ⏩  (Sin herramientas)                           ║');
  }
  console.log('╚══════════════════════════════════════════════════╝\n');

  let stopConversation = false;
  while (result.functionCalls && result.functionCalls.length > 0) {
    botUsedTool = true;
    console.log('>>> FUNCTION CALLS:', result.functionCalls.map((fc: any) => ({ name: fc.name, args: fc.args })));
    const responseParts = [];
    for (const call of result.functionCalls as FunctionCall[]) {
      const execResult = await executeToolCall(phone, call);

      if (execResult.meta?.showMenu) {
        showMenu = true;
        skipModelText = true;
        stopAfterTools = true;
      }
      if (execResult.meta?.showCategory) {
        categoryToShow = execResult.meta.showCategory;
        skipModelText = true;
        stopAfterTools = true;
      }
      if (execResult.meta?.showCart) {
        showCart = true;
        skipModelText = true;
        stopAfterTools = true;
      }
      if (execResult.meta?.cartUpdated) {
        cartUpdated = true;
      }
      if (execResult.meta?.deliveryUpdated) {
        deliveryUpdated = true;
      }
      // Si falta tamaño, inyectar prompt al modelo con botones sugeridos
      try {
        const parsed = JSON.parse(execResult.response);
        if (parsed.status === 'need_size') {
          const sizes: string[] = parsed.sizes || [];
          const sizeButtons = sizes.map((s) => ({ type: 'reply', reply: { id: `size_${s}`, title: s } }));
          await sendWhatsappMessage({
            to: phone,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: 'Elige el tamaño:' },
              action: { buttons: sizeButtons }
            }
          });
          pendingSizePrompt = true;
        }
      } catch {
        // ignore
      }
      if (execResult.meta?.confirmationMessage) {
        replies.push(execResult.meta.confirmationMessage);
      }
      if (execResult.meta?.stopConversation) {
        stopConversation = true;
        sessionWasReset = true;
      }

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: execResult.response },
          id: call.id
        }
      });
    }

    // Transformar a Content[]
    if (stopConversation || stopAfterTools) {
      break;
    }
    result = await sendMessageWithRetry(chat, { message: responseParts });
    console.log('>>> GEMINI RESPONSE (after tools):', {
      text: result.text,
      functionCalls: result.functionCalls?.map((fc: any) => ({ name: fc.name, args: fc.args }))
    });
  }

  if (pendingSizePrompt) {
    cartUpdated = false;
  }

  if (!stopConversation && result.text && !pendingSizePrompt && !skipModelText && !showMenu && !categoryToShow) {
    // Si es respuesta de confirmación final, formatear con íconos y dirección
    try {
      const parsed = JSON.parse(result.text);
      if (parsed.status === 'confirmed') {
        const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
        const itemsLines = (parsed.summary || []).map((it: any, idx: number) => `• ${it.quantity}x ${it.name} (${currency.format(it.lineTotal)})`);
        const addressLine = parsed.address ? `📍 Entrega: ${parsed.address}` : '';
        const nameLine = parsed.name ? `👤 Cliente: ${parsed.name}` : '';
        const totalLine = `💰 Total: ${currency.format(parsed.total || 0)}`;
        const orderLine = parsed.orderCode ? `🧾 Pedido: ${parsed.orderCode}` : parsed.orderId ? `🧾 Pedido: ${parsed.orderId}` : '';
        const thankYou = '🙌 ¡Pedido confirmado! Gracias por tu compra.';
        const formatted = [thankYou, orderLine, ...itemsLines, totalLine, addressLine, nameLine]
          .filter(Boolean)
          .join('\n');
        replies.push(formatted);
      } else {
        replies.push(result.text);
      }
    } catch {
      replies.push(result.text);
    }
  }

  if (isFirstInteraction && !botUsedTool) {
    const greetingAlreadyPresent = replies.some((replyText) => {
      const lower = replyText?.toLowerCase() || '';
      return lower.includes('benvenuto') || lower.includes('hola') || lower.includes('saludo');
    });
    if (!greetingAlreadyPresent) {
      replies.unshift(WELCOME_MESSAGE);
    }
  }

  if (!sessionWasReset) {
    const session = await sessionManager.getSession(phone);
    session.history.push(
      { role: 'user' as const, parts: [{ text }], timestamp: Date.now() },
      ...(result.text
        ? [{ role: 'assistant' as const, parts: [{ text: result.text }], timestamp: Date.now() }]
        : [])
    );
    await sessionManager.updateSession(phone, session);
  } else {
    console.log('🧹 Sesión finalizada/reseteada. Omitiendo guardado de historial para iniciar limpio.');
  }

  const hasAction =
    replies.length > 0 ||
    showMenu ||
    showCart ||
    !!categoryToShow ||
    cartUpdated ||
    deliveryUpdated;

  return {
    replies,
    showMenu,
    showCart,
    ...(categoryToShow ? { categoryToShow } : {}),
    ...(cartUpdated ? { cartUpdated: true } : {}),
    ...(deliveryUpdated ? { deliveryUpdated: true } : {}),
    handled: hasAction,
    needsFallback: !hasAction
  };
};
