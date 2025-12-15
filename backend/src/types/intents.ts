import { MenuCategory } from '../data/menu';

export type IntentType =
  | 'add_product'
  | 'remove_product'
  | 'change_quantity'
  | 'category_request'
  | 'menu_request'
  | 'confirm_order'
  | 'greeting'
  | 'smalltalk'
  | 'show_cart'
  | 'go_to_checkout'
  | 'help'
  | 'unknown';

export interface BaseIntent {
  type: IntentType;
  rawText: string;
}

export interface AddProductIntent extends BaseIntent {
  type: 'add_product';
  productName?: string;
  size?: string;
  quantity?: number;
}

export interface RemoveProductIntent extends BaseIntent {
  type: 'remove_product';
  productName?: string;
  size?: string;
  quantity?: number;
}

export interface ChangeQuantityIntent extends BaseIntent {
  type: 'change_quantity';
  productName?: string;
  size?: string;
  quantity: number;
  delta?: number;
}

export interface CategoryRequestIntent extends BaseIntent {
  type: 'category_request';
  category?: MenuCategory;
}

export interface MenuRequestIntent extends BaseIntent {
  type: 'menu_request';
}

export interface ConfirmOrderIntent extends BaseIntent {
  type: 'confirm_order';
}

export interface GreetingIntent extends BaseIntent {
  type: 'greeting';
}

export interface SmalltalkIntent extends BaseIntent {
  type: 'smalltalk';
}

export interface ShowCartIntent extends BaseIntent {
  type: 'show_cart';
}

export interface GoToCheckoutIntent extends BaseIntent {
  type: 'go_to_checkout';
}

export interface HelpIntent extends BaseIntent {
  type: 'help';
  reason?: string;
}

export interface UnknownIntent extends BaseIntent {
  type: 'unknown';
  reason?: string;
}

export type Intent =
  | AddProductIntent
  | RemoveProductIntent
  | ChangeQuantityIntent
  | CategoryRequestIntent
  | MenuRequestIntent
  | ConfirmOrderIntent
  | GreetingIntent
  | SmalltalkIntent
  | ShowCartIntent
  | GoToCheckoutIntent
  | HelpIntent
  | UnknownIntent;
