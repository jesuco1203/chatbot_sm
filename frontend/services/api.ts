import { Order, OrderStatus, Product } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const fetchOrders = async (): Promise<Order[]> => {
  const res = await fetch(`${API_BASE_URL}/orders`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  const data = await res.json();
  return data.map((o: any) => ({
    ...o,
    orderCode: o.orderCode || o.order_code || undefined
  }));
};

export const updateOrderStatus = async (id: string, newStatus: OrderStatus, phoneNumber?: string): Promise<Order> => {
  const res = await fetch(`${API_BASE_URL}/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, phoneNumber })
  });
  if (!res.ok) throw new Error('Failed to update order');
  return res.json();
};

export const fetchProducts = async (): Promise<Product[]> => {
  const res = await fetch(`${API_BASE_URL}/products?all=true`);
  if (!res.ok) throw new Error('Failed to fetch products');
  const data = await res.json();
  return data.map((p: any) => ({
    ...p,
    isActive: p.is_active ?? p.isActive ?? true
  }));
};

export const saveProduct = async (product: Product) => {
  const isNew = !product.id;
  const url = isNew ? `${API_BASE_URL}/products` : `${API_BASE_URL}/products/${product.id}`;
  const method = isNew ? 'POST' : 'PUT';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...product,
      is_active: product.isActive
    })
  });
  if (!res.ok) throw new Error('Failed to save product');
  return res.json();
};

export const deleteProduct = async (id: string) => {
  const res = await fetch(`${API_BASE_URL}/products/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete product');
  return res.json();
};

export const fetchIngredients = async () => {
  const res = await fetch(`${API_BASE_URL}/inventory`);
  if (!res.ok) throw new Error('Failed to fetch ingredients');
  return res.json();
};

export const fetchRecipe = async (productId: string) => {
  const res = await fetch(`${API_BASE_URL}/products/${productId}/recipe`);
  if (!res.ok) throw new Error('Failed to fetch recipe');
  return res.json();
};

export const saveRecipe = async (productId: string, ingredients: { ingredient_id: string; quantity: number }[]) => {
  const res = await fetch(`${API_BASE_URL}/products/${productId}/recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients })
  });
  if (!res.ok) throw new Error('Failed to save recipe');
  return res.json();
};

export const saveIngredient = async (ingredient: {
  id: string;
  name: string;
  unit: string;
  cost?: number;
  stock?: number;
  min_stock?: number;
}) => {
  const res = await fetch(`${API_BASE_URL}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ingredient)
  });
  if (!res.ok) throw new Error('Failed to save ingredient');
  return res.json();
};
