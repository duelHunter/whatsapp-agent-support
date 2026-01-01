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

export type WaRole = "owner" | "admin" | "operator" | "viewer";

export type WaStatus = "connected" | "disconnected" | "pending_qr" | "error";

export interface Membership {
  wa_account_id: string;
  role: WaRole;
}

export interface WaAccount {
  id: string;
  org_id: string;
  display_name: string;
  phone_number?: string | null;
  status: WaStatus;
  last_qr_at?: string | null;
  last_connected_at?: string | null;
  notes?: string | null;
  created_at: string;
  role?: WaRole;
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
  accounts: WaAccount[];
}

export interface WhatsAppAccountResponse {
  ok: boolean;
  account: WaAccount;
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
  account: WaAccount;
}

