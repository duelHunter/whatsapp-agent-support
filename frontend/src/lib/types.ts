export interface KbAddTextRequest {
  title: string;
  text: string;
}

export interface KbAddTextResponse {
  ok: boolean;
  addedChunks: number;
}

export interface KbUploadPdfResponse {
  ok: boolean;
  title: string;
  addedChunks: number;
  pages: number | null;
  error?: string;
}

export type UserRole = "admin" | "user";

export type WaStatus = "connected" | "disconnected" | "pending_qr" | "error";

export interface Membership {
  org_id: string;
  role: UserRole;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  display_name?: string;
  phone_number?: string | null;
  status?: WaStatus;
  last_qr_at?: string | null;
  last_connected_at?: string | null;
  notes?: string | null;
  created_at: string;
  role?: UserRole;
}

export interface WaAccountStats {
  account_id: string;
  status: WaStatus;
  phone_number?: string | null;
  display_name: string;
  total_conversations: number;
  total_messages: number;
  total_contacts: number;
  last_connected_at?: string | null;
  created_at: string;
}

export interface WhatsAppAccountsResponse {
  ok: boolean;
  accounts: Organization[];
}

export interface WhatsAppAccountResponse {
  ok: boolean;
  account: Organization;
}

export interface WhatsAppAccountStatsResponse {
  ok: boolean;
  stats: WaAccountStats;
}

export interface CreateWhatsAppAccountRequest {
  display_name: string;
  notes?: string;
}

export interface CreateWhatsAppAccountResponse {
  ok: boolean;
  account: Organization;
}

// ==================== Ordering Agent Types ====================

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "receipt_submitted"
  | "confirmed"
  | "delivering"
  | "delivered"
  | "cancelled";

export type AgentMode = "kb_only" | "ordering_agent";

export interface Book {
  id: string;
  org_id: string;
  title: string;
  author: string;
  isbn?: string | null;
  category?: string | null;
  description?: string | null;
  price: number;
  stock: number;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  book_id: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  books?: {
    title: string;
    author: string;
    isbn?: string;
  };
}

export interface Order {
  id: string;
  org_id: string;
  contact_id: string;
  conversation_id?: string;
  order_number: number;
  status: OrderStatus;
  subtotal: number;
  notes?: string | null;
  shipping_address?: string | null;
  admin_notes?: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  contacts?: {
    wa_number: string;
    name?: string;
  };
  items?: OrderItem[];
  receipts?: PaymentReceipt[];
}

export interface PaymentReceipt {
  id: string;
  order_id: string;
  media_type?: string;
  media_mime_type?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string;
  notes?: string;
  has_media?: boolean;
}

export interface AgentSettings {
  agent_mode: AgentMode;
  bank_transfer_details?: string | null;
}

