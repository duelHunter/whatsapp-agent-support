-- ============================================================
-- MIGRATION 002: Ordering Agent (Books E-Commerce)
-- ============================================================

-- 1. Order status enum
CREATE TYPE public.order_status AS ENUM (
  'draft',
  'pending_payment',
  'receipt_submitted',
  'confirmed',
  'delivering',
  'delivered',
  'cancelled'
);

-- 2. Books table
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  isbn text,
  category text,
  description text,
  price numeric(10, 2) NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_books_org_id ON public.books(org_id);
CREATE INDEX idx_books_title_search ON public.books USING gin(to_tsvector('english', title));
CREATE INDEX idx_books_author_search ON public.books USING gin(to_tsvector('english', author));
CREATE UNIQUE INDEX idx_books_isbn_org ON public.books(org_id, isbn) WHERE isbn IS NOT NULL;

-- 3. Orders table
CREATE SEQUENCE public.order_number_seq;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id),
  order_number integer NOT NULL DEFAULT nextval('public.order_number_seq'),
  status public.order_status NOT NULL DEFAULT 'draft',
  subtotal numeric(10, 2) DEFAULT 0,
  notes text,
  shipping_address text,
  admin_notes text,
  status_changed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_orders_org_id ON public.orders(org_id);
CREATE INDEX idx_orders_contact_id ON public.orders(contact_id);
CREATE INDEX idx_orders_status ON public.orders(org_id, status);
CREATE UNIQUE INDEX idx_orders_one_draft ON public.orders(org_id, contact_id) WHERE status = 'draft';

-- 4. Order items table (one order can contain multiple different books with different quantities )
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);

-- 5. Payment receipts table
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id),
  wa_message_id text,
  media_type text,
  media_mime_type text,
  media_data bytea,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_receipts_order_id ON public.payment_receipts(order_id);

-- 6. Add agent_mode and bank_transfer_details to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_mode text DEFAULT 'kb_only' CHECK (agent_mode IN ('kb_only', 'ordering_agent')),
  ADD COLUMN IF NOT EXISTS bank_transfer_details text;

-- 7. Enable RLS on new tables
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service role key)
CREATE POLICY "Service role full access" ON public.books FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.payment_receipts FOR ALL USING (true) WITH CHECK (true);
