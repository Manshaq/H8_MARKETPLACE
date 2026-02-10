
export enum ViewMode {
  HOME = 'HOME',
  MARKETPLACE = 'MARKETPLACE',
  PRODUCT_DETAIL = 'PRODUCT_DETAIL',
  SUPPORT_DM = 'SUPPORT_DM',
  CART = 'CART',
  ADMIN = 'ADMIN',
  CHECKOUT_FORM = 'CHECKOUT_FORM',
  ORDER_TRACKING = 'ORDER_TRACKING'
}

export interface Review {
  id: string;
  userName: string;
  rating: number; // 1-5
  comment: string;
  timestamp: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string; // Main display image
  images?: string[]; // Gallery images (up to 5)
  description: string;
  colors?: string[];
  isOutOfStock?: boolean;
  discount?: number; // Percentage 0-100
  reviews?: Review[];
}

export interface CartItem extends Product {
  selectedColor?: string;
  quantity: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isInvoice?: boolean;
  groundingLinks?: { title: string; uri: string }[];
}

export interface ImageResult {
  url: string;
  prompt: string;
  timestamp: number;
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export type OrderStatus = 'PENDING' | 'VALIDATED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'REJECTED';

export interface Order {
  id: string;
  customer: CustomerDetails;
  items: CartItem[];
  totalAmount: number;
  status: OrderStatus;
  timestamp: number;
  paymentMethod: string;
}
