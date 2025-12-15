CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  grande_price NUMERIC(8,2),
  familiar_price NUMERIC(8,2),
  simple_price NUMERIC(8,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp')),
  items JSONB NOT NULL,
  total NUMERIC(8,2) NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(8,2) NOT NULL,
  subtotal NUMERIC(8,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_users (
  phone_number TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_interaction TIMESTAMPTZ,
  orders_count INTEGER DEFAULT 0,
  total_spent NUMERIC(10,2) DEFAULT 0
);

-- Persisted chat sessions for WhatsApp bot
CREATE TABLE IF NOT EXISTS sessions (
  phone_number TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory Management Tables

CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- e.g., 'kg', 'g', 'l', 'unit'
  current_stock NUMERIC(10,3) DEFAULT 0,
  min_stock_threshold NUMERIC(10,3) DEFAULT 5,
  cost_per_unit NUMERIC(10,2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC(10,3) NOT NULL, -- Amount of ingredient used per product unit
  size TEXT, -- Optional: if recipe varies by size (e.g., 'familiar' uses more cheese)
  UNIQUE(product_id, ingredient_id, size)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity NUMERIC(10,3) NOT NULL,
  reason TEXT,
  reference_id TEXT, -- Can link to an order_id or manual entry
  created_at TIMESTAMPTZ DEFAULT now()
);

