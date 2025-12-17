export type MenuCategory = 'pizza' | 'lasagna' | 'drink' | 'extra';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: MenuCategory;
  prices: Record<string, number>;
  keywords?: string[];
}
