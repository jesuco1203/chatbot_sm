import { sessionManager } from '../../services/sessionManager';
import { sendWhatsappMessage, SendMessagePayload, markMessageAsRead } from '../../services/whatsappService';
import { getCategories, getItemsByCategory, MenuCategory, MenuItem } from '../../data/menu';
import { processNaturalMessage } from '../../chatbot/agent';
import { WELCOME_MESSAGE } from '../../chatbot/instructions';
import { loadEnv } from '../../config/environment'; // Import loadEnv
import { calculateDistance } from '../../utils/geo'; // Import calculateDistance

const env = loadEnv(); // Load environment variables

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

const extractInput = (message: IncomingMessage) =>
  message.interactive?.button_reply?.id ||
  message.interactive?.list_reply?.id ||
  message.button?.payload ||
  message.text?.body?.trim().toLowerCase();

const formatCartSummary = async (phone: string) => {
  const session = await sessionManager.getSession(phone);
  const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const cartSummary = session.cart.map(item => `• ${item.quantity}x ${item.name} (${currency.format(item.price)})`).join('\n');
  const totalCart = session.cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const deliveryCost = session.delivery?.cost || 0;
  const totalWithDelivery = totalCart + deliveryCost;
  return { cartSummary, totalCart, deliveryCost, totalWithDelivery: currency.format(totalWithDelivery), currency };
};

const sendCartSummary = async (phone: string) => {
  const session = await sessionManager.getSession(phone);
  if (session.cart.length === 0) {
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: 'Tu carrito está vacío.' }
    });
    return;
  }
  const { cartSummary, totalWithDelivery } = await formatCartSummary(phone);
  await sendWhatsappMessage({
    to: phone,
    type: 'text',
    text: {
      body: `🛒 Resumen del Carrito:\n${cartSummary}\n\n💰 Total: ${totalWithDelivery}`
    }
  });
};

const sendCheckoutSummary = async (phone: string) => {
  const session = await sessionManager.getSession(phone);
  if (session.cart.length === 0) {
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: 'Tu carrito está vacío. Elige algo del menú para continuar.' }
    });
    return;
  }

  const needsName = !session.name;
  const needsAddress = !session.address;
  const needsLocation = !session.delivery?.location; // Check if location is missing
  if (needsName || needsAddress || needsLocation) {
    const missing = [
      needsName ? 'tu nombre completo' : null,
      needsAddress ? 'tu dirección con referencia' : null,
      needsLocation ? 'tu ubicación para calcular el delivery' : null
    ]
      .filter(Boolean)
      .join(' y ');
    await sendWhatsappMessage({
      to: phone,
      type: 'text',
      text: { body: `Antes de confirmar, necesito ${missing}. Por favor envíalo en un solo mensaje o comparte tu ubicación.` }
    });
    return;
  }

  const { cartSummary, totalWithDelivery, deliveryCost, currency } = await formatCartSummary(phone);
  await sendWhatsappMessage({
    to: phone,
    type: 'text',
    text: {
      body: `🔒 Revisemos tu pedido:\n\n🛒 Pedido:\n${cartSummary}\n\n📦 Delivery: ${currency.format(deliveryCost)}\n💰 Total: ${totalWithDelivery}\n📍 Entrega: ${session.address || 'Ubicación compartida'}\n👤 Cliente: ${session.name}\n\n¿Confirmo el pedido? Responde "confirmar" o "sí" para continuar.`
    }
  });
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

export const handleIncoming = async (message: IncomingMessage): Promise<void> => {
  if (message.id) {
    await markMessageAsRead(message.id);
  }

  const session = await sessionManager.getSession(message.from);
  const isFreshSession = (session.history?.length || 0) === 0;
  const send = (payload: SendMessagePayload) => sendWhatsappMessage(payload);

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
    const deliveryCost = distance * env.deliveryRatePerKm;

    session.delivery = {
      location: customerLocation,
      distance,
      cost: deliveryCost,
    };
    session.address = `Lat: ${customerLocation.latitude}, Lng: ${customerLocation.longitude} (Aprox. ${distance.toFixed(2)} km)`; // Set a temporary address for summary
    await sessionManager.updateSession(message.from, session);

    const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
    await send({
      to: message.from,
      type: 'text',
      text: { body: `¡Ubicación recibida! 📍\nDistancia a nuestro local: ${distance.toFixed(2)} km.\nEl costo de envío es: ${currency.format(deliveryCost)}.` }
    });

    // After receiving location, prompt for checkout if cart is not empty
    if (session.cart.length > 0) {
      await sendCheckoutSummary(message.from);
    }
    return;
  }
  const rawInput = extractInput(message);
  if (!rawInput) {
    return send({
      to: message.from,
      type: 'text',
      text: { body: 'No entendí eso 😅. Usa los botones para continuar.' }
    });
  }

  const normalizedInput = rawInput === 'show_menu' ? 'ver menu' : rawInput;
  const greetings = ['hola', 'holaa', 'holaaa', 'holaaaa', 'hi', 'hey', 'hello', 'buenas'];

  const DEV_PASS = 'admin123';
  if (normalizedInput === `!dev ${DEV_PASS}`) {
    session.isDevMode = true;
    await sessionManager.updateSession(message.from, session);
    await send({
      to: message.from,
      type: 'text',
      text: { body: '🕵️‍♂️ MODO DEBUG ACTIVADO\nAhora te mostraré mis variables internas y razonamiento.' }
    });
    return;
  }

  if (normalizedInput === '!dev off') {
    session.isDevMode = false;
    await sessionManager.updateSession(message.from, session);
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
    const item = getItemsByCategory('pizza')
      .concat(getItemsByCategory('lasagna'), getItemsByCategory('drink'), getItemsByCategory('extra'))
      .find((p) => p.id === baseId);
    if (item) {
      productSelected = { item, size: selectedSize };
    }
  }

  if (normalizedInput === 'continue_shopping') {
    const categories = getCategories();
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

  if (['go_checkout', 'finalizar compra', 'checkout', 'listo', 'eso es todo'].includes(normalizedInput)) {
    await sendCheckoutSummary(message.from);
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
    await sendCartSummary(message.from);
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
      await sessionManager.addToCart(message.from, { id: item.id, name: item.name, price }, 1);
      const { cartSummary, totalWithDelivery } = await formatCartSummary(message.from);
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
    await sessionManager.clearCart(message.from);

    await send({
      to: message.from,
      type: 'text',
      text: { body: '🗑️ Tu carrito ha sido vaciado completamente.' }
    });

    const categories = getCategories();
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
    const item = getItemsByCategory('pizza')
      .concat(getItemsByCategory('lasagna'), getItemsByCategory('drink'), getItemsByCategory('extra'))
      .find((p) => p.id === sizeSelection!.itemId);
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
      await sessionManager.addToCart(message.from, { id: item.id, name: item.name, price }, 1);
      const { cartSummary, totalWithDelivery } = await formatCartSummary(message.from);
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
    const items = getItemsByCategory(result.categoryToShow);
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
    const session = await sessionManager.getSession(message.from);
    if (session.cart.length > 0) {
      await sendCartSummary(message.from);
      await sendCartButtons(message.from);
    }
  }

  if (result.showCart) {
    await sendCartSummary(message.from);
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

  const hasWelcome = result.replies.some((reply) => reply?.includes(WELCOME_MESSAGE));

  if (isFreshSession && !shouldSendMenuList && !result.cartUpdated && !result.categoryToShow) {
    shouldSendMenuList = true;
    menuListBodyText = 'Aquí tienes nuestro menú 👇';
  }

  if (hasWelcome) {
    shouldSendMenuList = true;
  }

  if (shouldSendMenuList) {
    const categories = getCategories();
    await send({
      to: message.from,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: menuListBodyText },
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
  }
};
