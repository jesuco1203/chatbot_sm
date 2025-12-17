import OpenAI from 'openai';
import { loadEnv } from '../config/environment';
import { toolDeclarations, searchMenuTool } from './tools';
import { getSystemInstruction, WELCOME_MESSAGE } from './instructions';
import { sessionManager, UserSession } from '../services/sessionManager';
import { getItemById, MenuCategory, getItemsByCategory } from '../data/menu';
import { createOrder, getLastOrderStatus } from '../services/orderService';
import { getUserByPhone, upsertUser } from '../services/userService';
import { sendWhatsappMessage } from '../services/whatsappService';
import { detectCategoryFromText, searchMenu } from '../services/productSearch';
import { parseAddress, stringifyAddress } from '../utils/address';
import { calculateDistance } from '../utils/geo';
import { deepseekClient, defaultDeepseekModel } from '../llm/deepseekClient';

const env = loadEnv();

const buildDeliveryFromLocation = (lat: number, lng: number) => {
  const restaurantLocation = { latitude: env.restaurantLatitude, longitude: env.restaurantLongitude };
  const customerLocation = { latitude: lat, longitude: lng };
  const distance = calculateDistance(restaurantLocation, customerLocation);
  const rawCost = distance * env.deliveryRatePerKm;
  const cost = Math.max(rawCost, 3);
  return { location: customerLocation, distance, cost };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sendMessageWithRetry = async (
  payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  attempts = 0
): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
  const maxAttempts = 3;
  try {
    return await deepseekClient.chat.completions.create(payload);
  } catch (error: any) {
    console.error('>>> LLM ERROR:', error);
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
      return sendMessageWithRetry(payload, attempts + 1);
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
  const product = await getItemById(args.itemId);
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
    await sessionManager.removeFromCart(phone, itemToRemove.id, session);
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
  const { name, address, orderAddress, delivery } = session;

  if (session.pendingAddressChange) {
    const needsAddress = !session.pendingAddressChange.addressText;
    const needsChoice = session.pendingAddressChange.awaitingChoice;
    const needsLocation = !session.pendingAddressChange.location;
    if (needsAddress || needsChoice || needsLocation) {
      return {
        response: JSON.stringify({
          status: 'pending_address',
          message: 'Falta cerrar el cambio de dirección: dirección, ubicación y confirmación de uso.'
        })
      };
    }
  }

  const finalAddressText = orderAddress || address;

  if (!name || !finalAddressText) {
    return {
      response: JSON.stringify({
        status: 'pending_data',
        message: 'Faltan datos del cliente.'
      })
    };
  }

  // --- NUEVA VALIDACIÓN DE DELIVERY ---
  if (!delivery || !delivery.cost) {
    return {
      response: JSON.stringify({
        status: 'pending_delivery',
        message: 'Falta calcular el costo de envío. Por favor, pide al usuario que comparta su ubicación (Location) para calcular la distancia y el costo exacto antes de confirmar.'
      })
    };
  }
  // ------------------------------------

  if (session.cart.length === 0) {
    return {
      response: JSON.stringify({
        status: 'error',
        message: 'El carrito está vacío.'
      })
    };
  }

  const cartTotal = session.cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryCost = delivery.cost; // Ya validado arriba
  const total = cartTotal + deliveryCost;

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
  
  // Agregar línea de Delivery
  summaryLines.push(`📦 Delivery: ${currency.format(deliveryCost)}`);

  const totalLine = `💰 Total: ${currency.format(total)}`;
  const finalAddress = orderAddress || address;
  const addressLine = finalAddress ? `📍 Entrega: ${finalAddress}` : '';
  const nameLine = name ? `👤 Cliente: ${name}` : '';

  const addressPayload = stringifyAddress({
    text: finalAddressText ?? '',
    location: delivery?.location
      ? { lat: delivery.location.latitude, lng: delivery.location.longitude }
      : null
  });

  // Asegurar que el usuario exista antes de crear la orden (FK en orders)
  await upsertUser({
    phoneNumber: phone,
    name,
    address: addressPayload,
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
      deliveryCost,
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

const executeToolCall = async (
  phone: string,
  call: { name: string; args: Record<string, any>; id?: string }
): Promise<ToolExecutionResult> => {
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
        const session = await sessionManager.getSession(phone);
        await sessionManager.setDeliveryDetails(phone, call.args.name as string, call.args.address as string, session);
        return { response: JSON.stringify({ status: 'success' }), meta: { deliveryUpdated: true } };
      }
      return { response: JSON.stringify({ status: 'error', message: 'Missing arguments' }) };
    case 'confirmOrder':
      return handleConfirmOrder(phone);
    case 'addMixedPizza': {
      const session = await sessionManager.getSession(phone);
      const { flavorA, flavorB, size } = call.args || {};
      if (!flavorA || !flavorB || !size) {
        return { response: JSON.stringify({ status: 'error', message: 'Faltan datos para la pizza mixta.' }) };
      }
      const menuConcat = (await getItemsByCategory('pizza'));
      const p1 = menuConcat.find((p) => p.name.toLowerCase() === String(flavorA).toLowerCase());
      const p2 = menuConcat.find((p) => p.name.toLowerCase() === String(flavorB).toLowerCase());
      if (!p1 || !p2) {
        return { response: JSON.stringify({ status: 'error', message: 'No se encontraron ambos sabores.' }) };
      }
      if (!['Grande', 'Familiar'].includes(size)) {
        return { response: JSON.stringify({ status: 'error', message: 'Tamaño inválido para pizza mixta.' }) };
      }
      const priceA = p1.prices[size];
      const priceB = p2.prices[size];
      if (priceA === undefined || priceB === undefined) {
        return { response: JSON.stringify({ status: 'error', message: 'Alguno de los sabores no tiene precio para ese tamaño.' }) };
      }
      const mixedPrice = Math.max(priceA, priceB);
      const name = `Pizza Mixta (${p1.name} / ${p2.name})`;
      await sessionManager.addToCart(phone, { id: `mixed_${p1.id}_${p2.id}_${size}`, name, price: mixedPrice }, 1, session);
      return {
        response: JSON.stringify({
          status: 'success',
          message: `Añadí 1x ${name} (${size}) a tu carrito.`
        }),
        meta: { cartUpdated: true }
      };
    }
    case 'startCheckout': {
      const session = await sessionManager.getSession(phone);
      const needsName = !session.name;
      if (needsName) {
        return {
          response: JSON.stringify({
            status: 'need_name',
            message: 'Para generar tu pedido, primero necesito tu Nombre Completo. ¿Cómo te llamas?'
          })
        };
      }
      const finalAddress = session.orderAddress || session.address;
      const needsAddress = !finalAddress;
      const needsLocation = !session.delivery?.location;
      if (needsAddress || needsLocation) {
        return {
          response: JSON.stringify({
            status: 'need_address',
            message: `¡Gracias ${session.name}! Ahora necesito saber dónde entregarlo. Por favor escribe tu dirección y comparte tu ubicación (Maps) para calcular el delivery.`
          })
        };
      }
      return { response: JSON.stringify({ status: 'ready', message: 'Checkout listo' }), meta: { showCart: true } };
    }
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
  stopConversation?: boolean;
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
    lines.push('Cliente nuevo o con datos incompletos. Toma el pedido con tools, y pide nombre/dirección/ubicación solo al preparar el checkout/confirmación.');
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
        const meta = parseAddress(existingUser.address);
        session.address = meta.text || existingUser.address;
        if (meta.location) {
          const deliveryData = buildDeliveryFromLocation(meta.location.lat, meta.location.lng);
          session.delivery = deliveryData;
        }
      }
      sessionSnapshot = session;
      await sessionManager.updateSession(phone, session);
    }
  } catch (err) {
    console.error('>>> USER LOOKUP ERROR:', err);
  }

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

  const historyMessages = (sessionSnapshot.history || []).map((h) => {
    const parts = Array.isArray(h.parts) ? h.parts : [];
    const content = parts.map((p: any) => p?.text ?? '').join('\n');
    return {
      role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content
    };
  });

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: getSystemInstruction().replace('{{USER_ADDRESS}}', sessionSnapshot.orderAddress || sessionSnapshot.address || 'Not set') },
    ...historyMessages,
    { role: 'user', content: augmentedText }
  ];

  const extractText = (content: any) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => {
          if (typeof part === 'string') return part;
          return part?.text ?? '';
        })
        .join('');
    }
    return '';
  };

  console.log('🤖 [LLM] 🧠 Analizando contexto con DeepSeek...');
  let completion = await sendMessageWithRetry({
    model: defaultDeepseekModel,
    messages: baseMessages,
    tools: toolDeclarations as any,
    tool_choice: 'auto',
    temperature: sessionSnapshot.isDevMode ? 0 : 0.5
  });

  const firstChoice = completion.choices?.[0];
  if (!firstChoice) {
    throw new Error('LLM sin opciones de respuesta');
  }
  let message = firstChoice.message;
  let stopConversation = false;

  const logDecision = (msg: OpenAI.Chat.Completions.ChatCompletionMessage) => {
    const preview = extractText(msg.content).replace(/\n/g, ' ').substring(0, 50);
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║ 🤖 LLM DECISIÓN                                  ║');
    if (preview) console.log(`║ 🗣️  Respuesta: "${preview}..."`);
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      console.log('║ 🛠️  TOOLS INVOCADAS:                             ║');
      (msg.tool_calls as any[]).forEach((tc) => console.log(`║    👉 ${tc.function.name} Args: ${tc.function.arguments}`));
    } else {
      console.log('║ ⏩  (Sin herramientas)                           ║');
    }
    console.log('╚══════════════════════════════════════════════════╝\n');
  };

  logDecision(message);

  // Revisor: por ahora aprobamos todas las tool calls para no bloquear búsquedas ni agregados.
  const shouldExecuteToolCalls = async (_toolCalls: any[]): Promise<{ approve: boolean; reason?: string }> => {
    return { approve: true };
  };

  while ((message.tool_calls?.length || 0) > 0) {
    botUsedTool = true;
    const toolCalls: any[] = (message.tool_calls as any[]) || [];
    console.log('>>> FUNCTION CALLS:', toolCalls.map((tc) => ({ name: tc.function.name, args: tc.function.arguments })));

    const approval = await shouldExecuteToolCalls(toolCalls);
    if (!approval.approve) {
      replies.push(`No ejecuté las herramientas: ${approval.reason || 'rechazado'}`);
      stopConversation = true;
      break;
    }

    // Registrar el mensaje del asistente con las tool calls
    baseMessages.push({
      role: 'assistant',
      content: extractText(message.content),
      tool_calls: toolCalls
    } as any);

    for (const call of toolCalls) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      const execResult = await executeToolCall(phone, { name: call.function.name, args: parsedArgs, id: call.id });

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

      baseMessages.push({
        role: 'tool',
        tool_call_id: call.id || call.function?.name || 'tool_call',
        content: execResult.response
      } as any);
    }

    if (stopConversation || stopAfterTools) break;

    completion = await sendMessageWithRetry({
      model: defaultDeepseekModel,
      messages: baseMessages,
      tools: toolDeclarations as any,
      tool_choice: 'auto',
      temperature: sessionSnapshot.isDevMode ? 0 : 0.5
    });
    const nextChoice = completion.choices?.[0];
    if (!nextChoice) {
      throw new Error('LLM sin opciones de respuesta');
    }
    message = nextChoice.message;
    logDecision(message);
  }

  const resultText = extractText(message?.content);

  if (pendingSizePrompt) {
    cartUpdated = false;
  }

  if (!stopConversation && resultText && !pendingSizePrompt && !skipModelText && !showMenu && !categoryToShow) {
    // Si es respuesta de confirmación final, formatear con íconos y dirección
    try {
      const parsed = JSON.parse(resultText);
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
        replies.push(resultText);
      }
    } catch {
      replies.push(resultText);
    }
  }

  if (!sessionWasReset) {
    const session = await sessionManager.getSession(phone);
    session.history.push(
      { role: 'user' as const, parts: [{ text }], timestamp: Date.now() },
      ...(resultText
        ? [{ role: 'assistant' as const, parts: [{ text: resultText }], timestamp: Date.now() }]
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
