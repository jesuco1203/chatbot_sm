import { MENU, MenuCategory } from '../data/menu';
import { searchMenu } from '../services/productSearch';

const menuIds: string[] = MENU.map((item) => item.id);
const sizeEnum: string[] = Array.from(new Set(MENU.flatMap((item) => Object.keys(item.prices))));
const categoryEnum: MenuCategory[] = ['pizza', 'lasagna', 'drink', 'extra'];

export const toolDeclarations = [
  {
    type: 'function',
    function: {
      name: 'showCart',
      description: 'Muestra el carrito actual del cliente con formato estándar.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getMenu',
      description: 'Muestra las CATEGORÍAS del menú.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getMenuItems',
      description: 'Muestra los ítems de una categoría específica.',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', enum: categoryEnum, description: 'Categoría a presentar' }
        },
        required: ['categoryId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchMenu',
      description:
        'Busca CUALQUIER producto en el menú actualizado por nombre, categoría o ingredientes. Úsalo SIEMPRE que el usuario pregunte por disponibilidad.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Término a buscar (ej. "hawaiana", "picante")' },
          category: { type: 'string', enum: categoryEnum, description: 'Categoría (opcional)' },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ingredientes a evitar/excluir (ej. "cebolla", "pollo", "carne")'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addToCart',
      description: 'Agrega un ítem al carrito.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', enum: menuIds, description: 'ID del producto del menú' },
          quantity: { type: 'number', description: 'Cantidad solicitada', default: 1 },
          size: { type: 'string', enum: sizeEnum, description: 'Tamaño elegido (ej: Grande, Familiar)' }
        },
        required: ['itemId', 'quantity']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'removeFromCart',
      description: 'Elimina un ítem del carrito.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', enum: menuIds, description: 'ID del producto a eliminar' }
        },
        required: ['itemId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'setDeliveryDetails',
      description: 'Guarda nombre y dirección del cliente.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre completo del cliente' },
          address: { type: 'string', description: 'Dirección de entrega con referencia' }
        },
        required: ['name', 'address']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confirmOrder',
      description: 'Finaliza la orden (solo si hay nombre y dirección).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'startCheckout',
      description:
        'Úsala cuando el usuario indique que ha terminado de pedir, diga "es todo", "nada más", o quiera finalizar la compra.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addMixedPizza',
      description:
        'Agrega una Pizza Mixta (mitad y mitad) combinando dos sabores existentes. Solo disponible en tamaños Grande y Familiar.',
      parameters: {
        type: 'object',
        properties: {
          flavorA: { type: 'string', description: 'Primer sabor (nombre exacto del producto pizza)' },
          flavorB: { type: 'string', description: 'Segundo sabor (nombre exacto del producto pizza)' },
          size: { type: 'string', enum: ['Grande', 'Familiar'], description: 'Tamaño de la pizza mixta' }
        },
        required: ['flavorA', 'flavorB', 'size']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkOrderStatus',
      description: 'Consulta el estado del último pedido confirmado.',
      parameters: { type: 'object', properties: {} }
    }
  }
] as const;

// Helper para exponer resultados de búsqueda con precios completos
export const searchMenuTool = async (args: { query?: string; category?: MenuCategory | string; exclude?: string[] }) => {
  const results = await searchMenu({
    query: args.query || '',
    category: (args.category as MenuCategory) || undefined,
    exclude: args.exclude || []
  });

  return results.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    prices: p.prices,
    price_info: Object.entries(p.prices || {})
      .map(([size, price]) => `${size}: S/${price}`)
      .join(', ')
  }));
};
