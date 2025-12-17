import { sessionManager } from '../../services/sessionManager';
import { sendWhatsappMessage, SendMessagePayload, markMessageAsRead } from '../../services/whatsappService';
import { getCategories, getItemsByCategory, MenuCategory, MenuItem } from '../../data/menu';
import { getMenuCacheStats } from '../../services/menuCache';
import { processNaturalMessage } from '../../chatbot/agent';
import { loadEnv } from '../../config/environment'; // Import loadEnv
import { calculateDistance } from '../../utils/geo'; // Import calculateDistance
import { applyDeliveryFromCoords, coordsFromGoogleMapsUrl, extractFirstUrl, parseCoordsFromText, roundDeliveryCost } from '../../services/deliveryInput';
import { deepseekClient, defaultDeepseekModel } from '../../llm/deepseekClient';

const env = loadEnv(); // Load environment variables

const ADDRESS_CUES = /(jr\.?|jiron|jir[oó]n|calle|av\.?|avenida|pasaje|pje|mz|manzana|lote|#)/i;

const looksLikeOrder = (text: string) => {
  if (!text) return false;
  return /(pizza|piza|piza|lasagna|lasana|gaseosa|americana|familiar|grande|pepperoni|jam[oó]n|chorizo|bebida|pepsi|coca|papa|extra|pedido|quiero)/i.test(text);
};

const looksLikeAddress = (text: string) => {
  if (!text || text.length < 10) return false;
  const lowered = text.toLowerCase();
  const stopWords = ['ok', 'si', 'sí', 'gracias', 'confirmar', 'listo', 'finalizar', 'vale', 'eso es todo', 'es todo', 'seria todo', 'sería todo'];
  if (stopWords.some((w) => lowered.includes(w))) return false;
  if (lowered.includes('http://') || lowered.includes('https://')) return false;
  const hasNumber = /\d/.test(text);
  const hasStreetCue = ADDRESS_CUES.test(text) || /[a-záéíóúüñ]{3,}\s+\d{1,6}/i.test(text);
  return hasNumber && hasStreetCue;
};

const validateNameLLM = async (text: string): Promise<{ isValid: boolean; extractedName: string | null }> => {
  const prompt = `¿Este texto contiene un nombre personal real? Devuelve solo JSON: { "isValid": boolean, "extractedName": string | null }.
Texto: """${text}"""`;
  try {
    const completion = await deepseekClient.chat.completions.create({
      model: defaultDeepseekModel,
      messages: [
        { role: 'system', content: 'Eres un validador de nombres para un bot de delivery. Responde solo JSON válido.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 200
    });
    const content = completion.choices[0]?.message?.content;
    const arrContent = Array.isArray(content) ? (content as unknown[]) : null;
    const raw = typeof content === 'string' ? content : arrContent ? arrContent.join('') : content ? String(content) : '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      return {
        isValid: Boolean(parsed.isValid),
        extractedName: parsed.extractedName && String(parsed.extractedName).trim() ? String(parsed.extractedName).trim() : null
      };
    }
  } catch (e) {
    console.warn('validateNameLLM error', e);
  }
  return { isValid: false, extractedName: null };
};

const validateAddressLLM = async (text: string): Promise<{ isValid: boolean; address: string | null }> => {
  const prompt = `¿Este texto contiene una dirección o referencia válida para entrega? Devuelve solo JSON: { "isValid": boolean, "address": string | null }.
Texto: """${text}"""`;
  try {
    const completion = await deepseekClient.chat.completions.create({
      model: defaultDeepseekModel,
      messages: [
        { role: 'system', content: 'Eres un validador de direcciones para un bot de delivery. Responde solo JSON válido.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 200
    });
    const content = completion.choices[0]?.message?.content;
    const arrContent = Array.isArray(content) ? (content as unknown[]) : null;
    const raw = typeof content === 'string' ? content : arrContent ? arrContent.join('') : content ? String(content) : '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      return {
        isValid: Boolean(parsed.isValid),
        address: parsed.address && String(parsed.address).trim() ? String(parsed.address).trim() : null
      };
    }
  } catch (e) {
    console.warn('validateAddressLLM error', e);
  }
  return { isValid: false, address: null };
};

const extractAddressFromSentence = (text: string): string | null => {
  if (!text) return null;
  const t = text.trim();
  const patterns = [
    /(?:\bllegue\s+a\b|\bentregar\s+en\b|\benvi[ií]a(?:r|s)?\s+a\b|\bpara\s+entrega\s+en\b|\bdirecci[oó]n\s*:?\s*|\ben\s+la\b|\ben\b)\s+(.+)/i,
    /\b(?:a\s+)?(jr\.?|jiron|jir[oó]n|calle|av\.?|avenida|pasaje|pje)\s+(.+)/i
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      if (m[2]) return m[2].trim();
      if (m[1]) return m[1].trim();
      const last = m[m.length - 1];
      if (last) return last.trim();
    }
  }
  return null;
};

interface IncomingMessage {
  id?: string;
  from: string;
  text?: { body: string };
  button?: { payload: string; text: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  location?: { latitude: number; longitude: number }; // Added location type
}

const extractInput = (message: IncomingMessage) => {
  const rawText = message.text?.body?.trim();
  const hasUrl = rawText ? rawText.includes('http://') || rawText.includes('https://') : false;
  const normalizedText = hasUrl ? rawText : rawText?.toLowerCase();

  return (
    message.interactive?.button_reply?.id ||
    message.interactive?.list_reply?.id ||
    message.button?.payload ||
    normalizedText
  );
};

const formatCartSummary = (session: Awaited<ReturnType<typeof sessionManager.getSession>>) => {
  const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const cartSummary = session.cart.map(item => `• ${item.quantity}x ${item.name} (${currency.format(item.price)})`).join('\n');
  const totalCart = session.cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryCost = session.delivery?.cost || 0;
  const totalWithDelivery = totalCart + deliveryCost;
  return { cartSummary, totalCart, deliveryCost, totalWithDelivery: currency.format(totalWithDelivery), currency };
};

const sendCartSummary = async (phone: string, session: Awaited<ReturnType<typeof sessionManager.getSession>>) => {
  if (session.cart.length === 0) {
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: 'Tu carrito está vacío.' }
    });
    return;
  }
  const { cartSummary, totalWithDelivery } = formatCartSummary(session);
  await sendWhatsappMessage({
    to: phone,
    type: 'text',
    text: {
      body: `🛒 Resumen del Carrito:\n${cartSummary}\n\n💰 Total: ${totalWithDelivery}`
    }
  });
};

const sendWelcome = async (phone: string, session: Awaited<ReturnType<typeof sessionManager.getSession>>) => {
  const isKnown = !!session.name;
  const text = isKnown
    ? `👋 Hola ${session.name}, qué gusto verte de nuevo. ¿Qué se te antoja pedir hoy?`
    : '👋 ¡Bienvenid@ a Pizzería San Marzano! 🍕 ¿Qué se te antoja pedir?';
  await sendWhatsappMessage({
    to: phone,
    type: 'text',
    text: { body: text }
  });
};

const sendCheckoutSummary = async (phone: string, session: Awaited<ReturnType<typeof sessionManager.getSession>>): Promise<boolean> => {
  let mutated = false;
  if (session.cart.length === 0) {
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: 'Tu carrito está vacío. Elige algo del menú para continuar.' }
    });
    return mutated;
  }

  const needsName = !session.name;
  if (needsName) {
    session.waitingForName = true;
    mutated = true;
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: 'Para generar tu pedido, primero necesito tu Nombre Completo. ¿Cómo te llamas?' }
    });
    return mutated;
  }

  const needsAddress = !(session.address || session.orderAddress);
  const needsLocation = !session.delivery?.location; // Check if location is missing
  if (needsAddress || needsLocation) {
    session.waitingForAddress = true;
    mutated = true;
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: {
        body: `¡Gracias ${session.name}! Ahora necesito saber dónde entregarlo. Por favor escribe tu dirección y comparte tu ubicación (Maps) para calcular el delivery.`
      }
    });
    return mutated;
  }

  const { cartSummary, totalWithDelivery, deliveryCost, currency } = formatCartSummary(session);
  const finalAddress = session.orderAddress || session.address;
  await sendWhatsappMessage({
    to: phone,
    type: 'text',
    text: {
      body: `🔒 Revisemos tu pedido:\n\n🛒 Pedido:\n${cartSummary}\n\n📦 Delivery: ${currency.format(deliveryCost)}\n💰 Total: ${totalWithDelivery}\n📍 Entrega: ${finalAddress || 'Ubicación compartida'}\n👤 Cliente: ${session.name}\n\n¿Confirmo el pedido? Responde "confirmar" o "sí" para continuar.`
    }
  });
  return mutated;
};

const sendCartButtons = (to: string) =>
  sendWhatsappMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Deseas seguir comprando, modificar o finalizar tu pedido?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'continue_shopping', title: '📋 Seguir comprando' } },
          { type: 'reply', reply: { id: 'edit_order', title: '🛠️ Modificar pedido' } },
          { type: 'reply', reply: { id: 'go_checkout', title: '✅ Finalizar compra' } }
        ]
      }
    }
  });

const classifyUserTextLLM = async (text: string): Promise<'name' | 'address' | 'order' | 'other'> => {
  const prompt = `Clasifica el texto en una sola etiqueta: "name", "address", "order" u "other".
Devuelve solo la etiqueta.
Texto: """${text}"""`;

  try {
    const completion = await deepseekClient.chat.completions.create({
      model: defaultDeepseekModel,
      messages: [
        { role: 'system', content: 'Eres un clasificador de texto para un bot de delivery.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 4
    });
    const content = completion.choices[0]?.message?.content;
    const label = typeof content === 'string' ? content.trim().toLowerCase() : Array.isArray(content) ? String(content[0] || '').toLowerCase() : '';
    if (label.includes('name')) return 'name';
    if (label.includes('address') || label.includes('dire')) return 'address';
    if (label.includes('order') || label.includes('pedido')) return 'order';
    return 'other';
  } catch (e) {
    console.warn('LLM classify fallback error', e);
    return 'other';
  }
};

const extractAddressAndName = async (text: string): Promise<{ address: string | null; name: string | null }> => {
  const prompt = `Extrae en JSON: { "address": string, "name": string | null } del texto: """${text}""".
Devuelve solo el JSON válido, sin texto adicional. Si no hay nombre, usa null.`;
  try {
    const completion = await deepseekClient.chat.completions.create({
      model: defaultDeepseekModel,
      messages: [
        { role: 'system', content: 'Eres un extractor de datos para un bot de delivery. Responde solo JSON válido.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 200
    });
    const content = completion.choices[0]?.message?.content;
    const arrContent = Array.isArray(content) ? (content as unknown[]) : null;
    const raw =
      typeof content === 'string'
        ? content
        : arrContent
        ? arrContent.join('')
        : content
        ? String(content)
        : '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      return {
        address: typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null,
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null
      };
    }
  } catch (e) {
    console.warn('extractAddressAndName error', e);
  }
  return { address: null, name: null };
};

export const handleIncoming = async (message: IncomingMessage): Promise<void> => {
  if (message.id) {
    await markMessageAsRead(message.id);
  }

  let session = await sessionManager.getSession(message.from);
  let sessionDirty = false;
  const metrics = { sessionReads: 1, sessionWrites: 0, menuReads: 0, orderWrites: 0 };
  const cacheStatsStart = getMenuCacheStats();
  const persistSession = async () => {
    if (sessionDirty) {
      await sessionManager.updateSession(message.from, session);
      sessionDirty = false;
      metrics.sessionWrites += 1;
    }
  };
  const isFreshSession = (session.history?.length || 0) === 0;
  const send = (payload: SendMessagePayload) => sendWhatsappMessage(payload);

  try {
  const rawText = message.text?.body?.trim();
  const rawInput = extractInput(message);
  const greetings = ['hola', 'holaa', 'holaaa', 'holaaaa', 'hi', 'hey', 'hello', 'buenas', 'buen dia', 'buen día'];
  const normalizedInput = rawInput ? (rawInput === 'show_menu' ? 'ver menu' : rawInput) : '';
  const isGreetingWord = normalizedInput ? greetings.includes(normalizedInput) : false;
  const greetingWordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
  const isGreetingOnly =
    isFreshSession &&
    isGreetingWord &&
    !looksLikeOrder(rawText || '') &&
    !(rawText && ADDRESS_CUES.test(rawText)) &&
    greetingWordCount <= 3;

  const sendMenuList = async (bodyText: string) => {
    metrics.menuReads += 1;
    const categories = await getCategories();
    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: 'Ver Menú',
          sections: [
            {
              title: 'Menú',
              rows: categories.map((cat) => ({
                id: `cat_${cat.id}`,
                title: cat.label
              }))
            }
          ]
        }
      }
    });
  };

  // Enviar bienvenida solo si nunca se envió en esta sesión, es usuario sin ficha y la sesión está vacía
  const isNewUser = !session.name && (session.history?.length || 0) === 0;
  if (!session.hasWelcomed && isNewUser && (rawInput || rawText)) {
    await sendWelcome(message.from, session);
    session.hasWelcomed = true;
    sessionDirty = true;
    if (isGreetingOnly) {
      await sendMenuList('Aquí tienes nuestro menú 👇');
      await persistSession();
      return;
    }
  }

  // Si estamos esperando nombre, validar con mini-LLM
  if (session.waitingForName && rawText) {
    const nameValidation = await validateNameLLM(rawText);
    if (nameValidation.isValid && nameValidation.extractedName) {
      session.name = nameValidation.extractedName;
      session.waitingForName = false;
      sessionDirty = true;
      await persistSession();
    } else {
      await send({
        to: message.from,
        type: 'text',
        text: { body: 'No logré capturar tu nombre. ¿Me lo repites, por favor?' }
      });
      return;
    }
  }

  // Si estamos esperando dirección, validar con mini-LLM
  if (session.waitingForAddress && rawText) {
    const addrValidation = await validateAddressLLM(rawText);
    if (addrValidation.isValid && addrValidation.address) {
      session.address = addrValidation.address;
      session.orderAddress = addrValidation.address;
      session.waitingForAddress = false;
      sessionDirty = true;
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Dirección guardada: "${addrValidation.address}". Ahora comparte tu ubicación (WhatsApp o Maps) para calcular el delivery.` }
      });
      await persistSession();
      return;
    } else {
      await send({
        to: message.from,
        type: 'text',
        text: { body: 'No logré entender la dirección. Por favor envíala con calle, número y referencia.' }
      });
      return;
    }
  }

  // --- LOCATION HANDLING ---
  if (message.location) {
    const restaurantLocation = {
      latitude: env.restaurantLatitude,
      longitude: env.restaurantLongitude,
    };
    const customerLocation = {
      latitude: message.location.latitude,
      longitude: message.location.longitude,
    };

    const distance = calculateDistance(restaurantLocation, customerLocation);
    const rawDeliveryCost = distance * env.deliveryRatePerKm;
    const deliveryCost = roundDeliveryCost(Math.max(rawDeliveryCost, 3)); // Minimum delivery fee of 3 soles

    session.delivery = {
      location: customerLocation,
      distance,
      cost: deliveryCost,
    };
    if (!session.pendingAddressChange) {
      session.pendingAddressChange = {
        location: customerLocation,
        distance,
        cost: deliveryCost,
        requestedAt: new Date().toISOString(),
        suggestedText: null,
        awaitingChoice: false
      };
    } else {
      session.pendingAddressChange.location = customerLocation;
      session.pendingAddressChange.distance = distance;
      session.pendingAddressChange.cost = deliveryCost;
    }
    sessionDirty = true;

      const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
      await send({
      to: message.from,
      type: 'text',
      text: { body: `¡Ubicación recibida! 📍\nDistancia a nuestro local: ${distance.toFixed(2)} km.\nEl costo de envío es: ${currency.format(deliveryCost)}.` }
    });
    if (session.pendingAddressChange?.addressText) {
      session.address = session.pendingAddressChange.addressText;
      session.orderAddress = session.pendingAddressChange.addressText;
      session.pendingAddressChange = null;
      session.waitingForName = !session.name;
      session.waitingForAddress = false;
      sessionDirty = true;
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Dirección guardada: ${session.address}. ${session.name ? '' : 'Solo me falta tu nombre para confirmar.'}`.trim() }
      });
      await persistSession();
      if (session.cart.length > 0 && session.name) {
        sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
      }
      return;
    } else {
      session.waitingForName = !session.name;
      await persistSession();
      await send({
        to: message.from,
        type: 'text',
        text: { body: 'Ahora dime tu dirección exacta y referencia para esta ubicación (ej: calle, número, dpto, referencia).' }
      });
      return;
    }
  }
  if (!rawInput) {
    return send({
      to: message.from,
      type: 'text',
      text: { body: 'No entendí eso 😅. Usa los botones para continuar.' }
    });
  }

  // --- COORDS / MAPS LINK HANDLING (pre-LLM) ---
  console.log('[maps] rawText', rawText, 'rawInput', rawInput);
  const coordsFromText = parseCoordsFromText(rawInput || '');
  const urlInText = extractFirstUrl(rawText || rawInput || '');
  let resolvedCoords = coordsFromText;

  if (!resolvedCoords && urlInText && urlInText.includes('maps.')) {
    resolvedCoords = await coordsFromGoogleMapsUrl(urlInText);
  }

  if (resolvedCoords) {
    console.log('[maps] rawInput', rawInput, 'len', rawInput.length);
    console.log('✅ Coordenadas detectadas en mensaje:', resolvedCoords);
    session = await applyDeliveryFromCoords(message.from, { lat: resolvedCoords.lat, lng: resolvedCoords.lng }, session);
    if (session.pendingAddressChange?.addressText) {
      session.address = session.pendingAddressChange.addressText;
      session.orderAddress = session.pendingAddressChange.addressText;
      session.pendingAddressChange = null;
    }
    session.waitingForName = !session.name;
    sessionDirty = true;

    const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
    await send({
      to: message.from,
      type: 'text',
      text: {
        body: `¡Ubicación recibida! 📍\nDistancia a nuestro local: ${session.delivery?.distance.toFixed(2)} km.\nEl costo de envío es: ${currency.format(session.delivery?.cost || 0)}.`
      }
    });

    if (session.address) {
      await send({
        to: message.from,
        type: 'text',
        text: { body: session.waitingForName ? `Dirección guardada: ${session.address}. Solo me falta tu nombre para confirmar.` : `Dirección guardada: ${session.address}.` }
      });
      await persistSession();
      if (session.cart.length > 0 && session.name) {
        sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
      }
      return;
    } else {
      await send({
        to: message.from,
        type: 'text',
        text: { body: 'Ahora dime tu dirección exacta y referencia para esta ubicación (ej: calle, número, dpto, referencia).' }
      });
    }

    await persistSession();
    return;
  }
  if (urlInText && urlInText.includes('maps.') && !resolvedCoords) {
    console.log('[maps] rawInput', rawInput, 'len', rawInput.length);
    console.warn('⚠️ Link de Maps recibido pero sin coords legibles:', urlInText);
    await send({
      to: message.from,
      type: 'text',
      text: {
        body:
          'No pude leer tu ubicación desde el enlace de Maps 😅. Por favor comparte la ubicación directamente desde WhatsApp o envía las coordenadas en formato "lat,lng" (ej: -12.0538, -75.2092).'
      }
    });
    return;
  }

  // Si el usuario envía una dirección y no hay pending, crear pending y pedir ubicación
  if (!session.pendingAddressChange && rawText && looksLikeAddress(rawText)) {
    const extraction = await extractAddressAndName(rawText);
    console.log('🔍 [Mini-LLM] Extracción:', extraction);
    if (extraction.name) {
      session.name = extraction.name;
      session.waitingForName = false;
      sessionDirty = true;
    }
    if (extraction.address) {
      session.pendingAddressChange = {
        location: null,
        distance: 0,
        cost: 0,
        requestedAt: new Date().toISOString(),
        suggestedText: extraction.address,
        addressText: extraction.address,
        awaitingChoice: false
      };
      sessionDirty = true;
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Dirección recibida: "${extraction.address}". Ahora comparte la ubicación (WhatsApp o Maps) para calcular el delivery.` }
      });
      await persistSession();
      return;
    }
  }

  // Captura explícita de nombre (solo si el usuario lo declara o lo envía tras pedirlo)
  if (!session.name && rawText && !message.interactive && !message.button) {
    const nameMatch = rawText.match(/(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñü\s]{2,50})/i);
    let candidate: string | null = null;
    const originalRawText = rawText;
    let remainingText: string = rawText || '';

    if (nameMatch && nameMatch[1]) {
      candidate = nameMatch[1].trim();
    } else {
      const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (session.pendingAddressChange && lines.length >= 2) {
        candidate = lines[0] || null;
        remainingText = lines.slice(1).join('\n'); // deja solo la parte de dirección para el extractor
      } else if (session.pendingAddressChange) {
        // Después de pedir nombre, aceptar un nombre corto sin keywords
        candidate = rawText.trim();
      }
    }

    // Si está esperando nombre explícitamente, acepta el texto tal cual (sin LLM)
    if (!candidate && session.waitingForName) {
      candidate = rawText.trim();
    }

    if (candidate) {
      const hasDigits = /\d/.test(candidate);
      const hasComma = candidate.includes(',') || candidate.includes('\n');
      const wordCount = candidate.split(/\s+/).filter(Boolean).length;
      if (!hasDigits && !hasComma && wordCount <= 5 && !looksLikeAddress(candidate) && !looksLikeOrder(candidate)) {
        session.name = candidate;
        sessionDirty = true;
        session.waitingForName = false;
        if ((session.orderAddress || session.address) && session.delivery && session.cart.length > 0) {
          await persistSession();
          sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
          return;
        }
        if (!remainingText) remainingText = originalRawText;
        await persistSession();
      }
    } else if (/\d/.test(rawText)) {
      // Si tiene números y no pasó filtros, usar LLM para clasificar
      const label = await classifyUserTextLLM(rawText);
      if (label === 'name') {
        session.name = rawText.trim();
        sessionDirty = true;
        session.waitingForName = false;
        if ((session.orderAddress || session.address) && session.delivery && session.cart.length > 0) {
          await persistSession();
          sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
          return;
        }
        await persistSession();
      } else if (label === 'address' && !session.pendingAddressChange) {
        session.pendingAddressChange = {
          location: null,
          distance: 0,
          cost: 0,
          requestedAt: new Date().toISOString(),
          suggestedText: rawText.trim(),
          addressText: rawText.trim(),
          awaitingChoice: false
        };
        sessionDirty = true;
        await send({
          to: message.from,
          type: 'text',
          text: { body: `Dirección recibida: "${rawText.trim()}". Ahora comparte la ubicación de ese punto (envía tu ubicación o un enlace de Google Maps) para calcular el delivery.` }
        });
        await persistSession();
        return;
      }
    }
  }

  const DEV_PASS = 'admin123';
  if (normalizedInput === `!dev ${DEV_PASS}`) {
    session.isDevMode = true;
    sessionDirty = true;
    await send({
      to: message.from,
      type: 'text',
      text: { body: '🕵️‍♂️ MODO DEBUG ACTIVADO\nAhora te mostraré mis variables internas y razonamiento.' }
    });
    return;
  }

  if (normalizedInput === '!dev off') {
    session.isDevMode = false;
    sessionDirty = true;
    await send({
      to: message.from,
      type: 'text',
      text: { body: '👋 Modo debug desactivado. Volviendo a vender pizzas.' }
    });
    return;
  }

  // --- LÓGICA DE PAGINACIÓN Y CATEGORÍA ---
  let categoryFromInput: MenuCategory | undefined;
  let pageToShow = 0;

  if (normalizedInput.startsWith('cat_')) {
    const payload = normalizedInput.replace('cat_', '');
    const parts = payload.split('_');
    let catId = payload;
    const lastPart = parts[parts.length - 1];

    if (!isNaN(Number(lastPart)) && parts.length > 1) {
      pageToShow = Number(lastPart);
      catId = parts.slice(0, -1).join('_');
    }

    const validCategories: MenuCategory[] = ['pizza', 'lasagna', 'drink', 'extra'];
    if (validCategories.includes(catId as MenuCategory)) {
      categoryFromInput = catId as MenuCategory;
    }
  }

  let sizeSelection: { size: string; itemId?: string } | undefined;
  if (normalizedInput.startsWith('size_')) {
    const sizePayload = normalizedInput.replace('size_', '');
    const parts = sizePayload.split('_');
    if (parts.length >= 2) {
      const size = parts[0] || '';
      const itemId = parts.slice(1).join('_');
      if (size) {
        sizeSelection = { size, itemId };
      }
    } else if (sizePayload) {
      sizeSelection = { size: sizePayload };
    }
  }

  // --- PENDING ADDRESS HANDLING ---
  if (session.pendingAddressChange && !normalizedInput.startsWith('cat_') && !normalizedInput.startsWith('prod_') && !normalizedInput.startsWith('size_')) {
    const pending = session.pendingAddressChange;

    // Si aún no tenemos la dirección exacta, validar que este texto parezca dirección
    if (!pending.addressText && rawText) {
      const extractedAddress = extractAddressFromSentence(rawText);
      let tailCandidate: string | null = null;
      const hasCue = ADDRESS_CUES.test(rawText);
      const looksAddr = looksLikeAddress(rawText);
      if (!extractedAddress && looksLikeOrder(rawText)) {
        const parts = rawText.split(/\s+a\s+/i);
        const tail = parts.length > 1 ? parts[parts.length - 1] : null;
        if (tail && looksLikeAddress(tail)) {
          tailCandidate = tail.trim();
        }
      }
      const addressCandidate = extractedAddress || tailCandidate || (hasCue && looksAddr ? rawText : null);
      console.log('[address] extractedAddress:', extractedAddress, 'tailCandidate:', tailCandidate, 'looksLikeOrder:', looksLikeOrder(rawText));
      if (!addressCandidate) {
        // Deja que el LLM procese el mensaje completo si no se pudo extraer dirección útil
        console.log('[address] no address candidate, derivando a LLM');
      } else {
        pending.addressText = addressCandidate;
        sessionDirty = true;
        if (pending.location) {
          session.address = pending.addressText;
          session.orderAddress = pending.addressText;
          session.pendingAddressChange = null;
          session.waitingForName = !session.name;
          await persistSession();
          await send({
            to: message.from,
            type: 'text',
            text: { body: session.waitingForName ? `Dirección guardada: ${session.address}. Solo me falta tu nombre para confirmar.` : `Dirección guardada: ${session.address}.` }
          });
          if (session.cart.length > 0 && session.name) {
            sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
          }
          return;
        } else {
          await send({
            to: message.from,
            type: 'text',
            text: { body: `Dirección recibida: "${addressCandidate}". Ahora comparte la ubicación de ese punto (envía tu ubicación o un enlace de Google Maps) para calcular el delivery.` }
          });
          await persistSession();
          return;
        }
      }
    }

    // Si ya tenemos dirección pero falta ubicación, pedir ubicación
    if (pending.addressText && (!pending.location || !pending.location.latitude)) {
      await send({
        to: message.from,
        type: 'text',
        text: { body: 'Me falta la ubicación de esa dirección para calcular el delivery. Por favor comparte tu ubicación o un enlace de Google Maps.' }
      });
      return;
    }

    // Si tenemos dirección y ubicación, ofrecer opciones
    if (pending.addressText && pending.location) {
      session.address = pending.addressText;
      session.orderAddress = pending.addressText;
      session.pendingAddressChange = null;
      session.waitingForName = !session.name;
      session.waitingForAddress = false;
      sessionDirty = true;
      await persistSession();
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Dirección actualizada a: ${session.address}. ${session.name ? '' : 'Ahora dime tu nombre completo.'}`.trim() }
      });
      if (session.cart.length > 0) {
        sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
      }
      return;
    }
  }

  let productSelected: { item: MenuItem; size?: string | undefined } | undefined;
  if (normalizedInput.startsWith('prod_')) {
    const payload = normalizedInput.replace('prod_', '');
    let baseId: string = payload;
    let selectedSize: string | undefined;
    if (payload.includes('__')) {
      const [idPart, sizePart] = payload.split('__');
      baseId = idPart || '';
      selectedSize = sizePart || undefined;
    }
    metrics.menuReads += 4;
    metrics.menuReads += 1;
    const menuConcat = (await getItemsByCategory('pizza'))
      .concat(await getItemsByCategory('lasagna'), await getItemsByCategory('drink'), await getItemsByCategory('extra'));
    const item = menuConcat.find((p) => p.id === baseId);
    if (item) {
      productSelected = { item, size: selectedSize };
    }
  }

  if (normalizedInput === 'continue_shopping') {
    metrics.menuReads += 1;
    const categories = await getCategories();
    await send({
      to: message.from,
      type: 'text',
      text: { body: 'Perfecto, sigamos. Elige del menú 👇' }
    });
    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Aquí tienes nuestro menú 👇' },
        action: {
          button: 'Ver Menú',
          sections: [
            {
              title: 'Menú',
              rows: categories.map((cat) => ({
                id: `cat_${cat.id}`,
                title: cat.label
              }))
            }
          ]
        }
      }
    });
    return;
  }

  const hasActiveContext = session.cart.length > 0 || !!session.name || !!session.address;
  if (!isFreshSession && hasActiveContext && greetings.includes(normalizedInput)) {
    await send({
      to: message.from,
      type: 'text',
      text: { body: 'Seguimos con tu pedido. Puedes ver el carrito, editar o finalizar cuando gustes.' }
    });
    await sendCartButtons(message.from);
    return;
  }

  if (['go_checkout', 'finalizar compra', 'checkout', 'listo', 'eso es todo', 'nada mas', 'nada más', 'ya termine', 'ya terminé'].includes(normalizedInput)) {
    sessionDirty = (await sendCheckoutSummary(message.from, session)) || sessionDirty;
    return;
  }
  if (normalizedInput === 'edit_order') {
    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '🛠️ ¿Qué deseas hacer con tu pedido?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'clear_cart', title: '🗑️ Vaciar Carrito' } },
            { type: 'reply', reply: { id: 'continue_shopping', title: '➕ Agregar Productos' } },
            { type: 'reply', reply: { id: 'go_checkout', title: '🔙 Volver / Pagar' } }
          ]
        }
      }
    });
    return;
  }
  if (['muestra carrito', 'muéstrame el carrito', 'ver carrito', 'ver pedido', 'mostrar carrito', 'show_cart'].includes(normalizedInput)) {
    await sendCartSummary(message.from, session);
    await sendCartButtons(message.from);
    return;
  }

  if (productSelected) {
    const { item, size: preselectedSize } = productSelected;
    if (item.category === 'pizza') {
      const sizeButtons = Object.keys(item.prices).map((s) => ({
        type: 'reply',
        reply: { id: `size_${s}_${item.id}`, title: s }
      }));
      await send({
        to: message.from,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: `Elige el tamaño para ${item.name}` },
          action: { buttons: sizeButtons }
        }
      });
      return;
    } else {
      const price = (preselectedSize ? item.prices[preselectedSize] : undefined) ?? Object.values(item.prices)[0] ?? 0;
      session = await sessionManager.addToCart(message.from, { id: item.id, name: item.name, price }, 1, session);
      sessionDirty = true;
      const { cartSummary, totalWithDelivery } = formatCartSummary(session);
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Añadí 1x ${item.name}${preselectedSize ? ` (${preselectedSize})` : ''} a tu carrito.\n\n🛒 Resumen del Carrito:\n${cartSummary}\n\n💰 Total: ${totalWithDelivery}` }
      });
      await sendCartButtons(message.from);
      return;
    }
  }
  if (normalizedInput === 'clear_cart') {
    session = await sessionManager.clearCart(message.from, session);
    sessionDirty = true;

    await send({
      to: message.from,
      type: 'text',
      text: { body: '🗑️ Tu carrito ha sido vaciado completamente.' }
    });

    metrics.menuReads += 1;
    const categories = await getCategories();
    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: '¿Qué se te antoja pedir ahora? 👇' },
        action: {
          button: 'Ver Menú',
          sections: [
            {
              title: 'Categorías',
              rows: categories.map((cat) => ({
                id: `cat_${cat.id}`,
                title: cat.label
              }))
            }
          ]
        }
      }
    });
    return;
  }

  if (sizeSelection?.size && sizeSelection.itemId) {
    metrics.menuReads += 1;
    const menuConcat = (await getItemsByCategory('pizza'))
      .concat(await getItemsByCategory('lasagna'), await getItemsByCategory('drink'), await getItemsByCategory('extra'));
    const item = menuConcat.find((p) => p.id === sizeSelection!.itemId);
    if (item) {
      const price = item.prices[sizeSelection.size];
      if (price === undefined) {
        await send({
          to: message.from,
          type: 'text',
          text: { body: 'Ese tamaño no está disponible.' }
        });
        return;
      }
      session = await sessionManager.addToCart(message.from, { id: item.id, name: item.name, price }, 1, session);
      sessionDirty = true;
      const { cartSummary, totalWithDelivery } = formatCartSummary(session);
      await send({
        to: message.from,
        type: 'text',
        text: { body: `Añadí 1x ${item.name} (${sizeSelection.size}) a tu carrito.\n\n🛒 Resumen del Carrito:\n${cartSummary}\n\n💰 Total: ${totalWithDelivery}` }
      });
      await sendCartButtons(message.from);
      return;
    }
  }

  const result = categoryFromInput
    ? {
        replies: [] as string[],
        showMenu: false,
        categoryToShow: categoryFromInput,
        cartUpdated: false,
        deliveryUpdated: false,
        handled: true
      }
    : await processNaturalMessage(message.from, normalizedInput);

  // Tras la respuesta del LLM, recarga la sesión (incluye history) y márcala como modificada
  session = await sessionManager.getSession(message.from);
  sessionDirty = true;

  if (sizeSelection) {
    if (sizeSelection.size) {
      return handleIncoming({
        ...message,
        text: { body: sizeSelection.size }
      });
    }
  }

  let shouldSendMenuList = false;
  let menuListBodyText = 'Aquí tienes nuestro menú 👇';
  if (result.showMenu || normalizedInput === 'ver menu') {
    shouldSendMenuList = true;
    menuListBodyText = 'Elige una categoría 🍕';
  }

  if (result.categoryToShow) {
    metrics.menuReads += 1;
    const items = await getItemsByCategory(result.categoryToShow);
    const ITEMS_PER_PAGE = 9;
    const start = pageToShow * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const itemsInPage = items.slice(start, end);
    const hasNextPage = items.length > end;

    const rows = itemsInPage.flatMap((item) => {
      const maxTitleLength = 24;
      const name = item.name;
      let title = name;
      let overflow = '';
      if (name.length > maxTitleLength) {
        title = `${name.substring(0, maxTitleLength - 1)}…`;
        overflow = name.substring(maxTitleLength - 1).trim();
      }
      const makeDescription = (priceText: string) => {
        const descriptionParts = [overflow ? `${overflow}.` : '', item.description, priceText].filter(Boolean);
        let descriptionText = descriptionParts.join(' ');
        if (descriptionText.length > 70) {
          descriptionText = `${descriptionText.substring(0, 67)}…`;
        }
        return descriptionText;
      };

      if (item.category === 'drink' && Object.keys(item.prices).length > 1) {
        return Object.entries(item.prices).map(([size, price]) => {
          const priceText = `${size}: ${price}`;
          const fullTitle = `${title} ${size}`;
          const finalTitle = fullTitle.length > maxTitleLength ? `${fullTitle.slice(0, maxTitleLength - 1)}…` : fullTitle;
          return {
            id: `prod_${item.id}__${size}`,
            title: finalTitle,
            description: makeDescription(priceText)
          };
        });
      }

      const priceText = Object.entries(item.prices)
        .map(([size, price]) => {
          const shortSize =
            size.toLowerCase().startsWith('fam') ? 'F' : size.toLowerCase().startsWith('gran') ? 'G' : size;
          return `${shortSize}:${price}`;
        })
        .join(' ');

      const finalTitle = title.length > maxTitleLength ? `${title.slice(0, maxTitleLength - 1)}…` : title;

      return [
        {
          id: `prod_${item.id}`,
          title: finalTitle,
          description: makeDescription(priceText)
        }
      ];
    });

    if (hasNextPage) {
      rows.push({
        id: `cat_${result.categoryToShow}_${pageToShow + 1}`,
        title: '➡️ Ver más...',
        description: 'Ver siguientes productos'
      });
    }

    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: `Elige una opción (${pageToShow + 1}) 👇` },
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: 'Opciones',
              rows
            }
          ]
        }
      }
    });
  }

  if (result.cartUpdated) {
    metrics.sessionReads += 1;
    session = await sessionManager.getSession(message.from);
    if (session.cart.length > 0) {
      await sendCartSummary(message.from, session);
      await sendCartButtons(message.from);
    }
  }

  // Evitar enviar el carrito dos veces en el mismo turno
  if (result.showCart && !result.cartUpdated) {
    metrics.sessionReads += 1;
    session = await sessionManager.getSession(message.from);
    await sendCartSummary(message.from, session);
    await sendCartButtons(message.from);
  }

  if (result.needsFallback) {
    await send({
      to: message.from,
      type: 'text',
      text: { body: 'Disculpa, no entendí tu último mensaje 😅' }
    });

    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '¿Qué te gustaría hacer?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'continue_shopping', title: 'Seguir comprando' } },
            { type: 'reply', reply: { id: 'show_cart', title: '🛒 Ver Carrito' } },
            { type: 'reply', reply: { id: 'go_checkout', title: '✅ Finalizar compra' } }
          ]
        }
      }
    });
  }

  for (const reply of result.replies) {
    await sendWhatsappMessage({
      to: message.from,
      type: 'text',
      text: { body: reply },
      contextMessageId: message.id
    });
  }

  if (shouldSendMenuList && !result.stopConversation) {
    await sendMenuList(menuListBodyText);
  }
  } finally {
    await persistSession();
    console.log('📊 handler metrics', {
      ...metrics,
      menuCache: getMenuCacheStats(),
      menuCacheDelta: (() => {
        const end = getMenuCacheStats();
        return {
          dbReadsMaxUpdatedAt: end.dbReadsMaxUpdatedAt - cacheStatsStart.dbReadsMaxUpdatedAt,
          dbReadsMenuFull: end.dbReadsMenuFull - cacheStatsStart.dbReadsMenuFull
        };
      })()
    });
  }
};
