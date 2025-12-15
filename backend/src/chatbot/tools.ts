import { FunctionDeclaration, Type } from '@google/genai';
import { MENU, MenuCategory, loadMenuFromDb } from '../data/menu';
import { searchMenu } from '../services/productSearch';

const menuIds = MENU.map((item) => item.id);
const sizeEnum = Array.from(new Set(MENU.flatMap((item) => Object.keys(item.prices))));
const categoryEnum: MenuCategory[] = ['pizza', 'lasagna', 'drink', 'extra'];

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'showCart',
    description: 'Muestra el carrito actual del cliente con formato estándar.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'getMenu',
    description: 'Muestra las CATEGORÍAS del menú.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'getMenuItems',
    description: 'Muestra los ítems de una categoría específica.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        categoryId: { type: Type.STRING, enum: categoryEnum, description: 'Categoría a presentar' }
      },
      required: ['categoryId']
    }
  },
  {
    name: 'searchMenu',
    description:
      'Busca CUALQUIER producto en el menú actualizado por nombre, categoría o ingredientes. Úsalo SIEMPRE que el usuario pregunte por disponibilidad.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Término a buscar (ej. "hawaiana", "picante")' },
        category: { type: Type.STRING, enum: categoryEnum, description: 'Categoría (opcional)' },
        exclude: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Ingredientes a evitar/excluir (ej. "cebolla", "pollo", "carne")'
        }
      }
    }
  },
  {
    name: 'addToCart',
    description: 'Agrega un ítem al carrito.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        itemId: { type: Type.STRING, enum: menuIds, description: 'ID del producto del menú' },
        quantity: { type: Type.NUMBER, description: 'Cantidad solicitada', default: 1 },
        size: { type: Type.STRING, enum: sizeEnum, description: 'Tamaño elegido (ej. Grande, Familiar)' }
      },
      required: ['itemId', 'quantity']
    }
  },
  {
    name: 'removeFromCart',
    description: 'Elimina un ítem del carrito.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        itemId: { type: Type.STRING, enum: menuIds, description: 'ID del producto a eliminar' }
      },
      required: ['itemId']
    }
  },
  {
    name: 'setDeliveryDetails',
    description: 'Guarda nombre y dirección del cliente.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Nombre completo del cliente' },
        address: { type: Type.STRING, description: 'Dirección de entrega con referencia' }
      },
      required: ['name', 'address']
    }
  },
  {
    name: 'confirmOrder',
    description: 'Finaliza la orden (solo si hay nombre y dirección).',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'checkOrderStatus',
    description: 'Consulta el estado del último pedido confirmado.',
    parameters: { type: Type.OBJECT, properties: {} }
  }
];

// Helper para exponer resultados de búsqueda con precios completos
export const searchMenuTool = async (args: { query?: string; category?: MenuCategory | string; exclude?: string[] }) => {
  await loadMenuFromDb();
  const results = searchMenu({
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
