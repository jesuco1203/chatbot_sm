export type OrderStatus = 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered';

export interface OrderItem {
  name: string;
  quantity: number;
  notes?: string;
}

export interface Order {
  id: string;
  orderCode?: string;
  customerName: string;
  phoneNumber?: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string; // ISO String
}

export interface OrderAction {
  label: string;
  nextStatus: OrderStatus;
  color: string;
  icon: string;
}

export type ProductCategory = 'pizza' | 'lasagna' | 'drink' | 'extra';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  prices: Record<string, number>;
  keywords?: string[];
  isActive?: boolean;
}
