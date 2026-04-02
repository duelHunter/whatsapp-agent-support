import { API_BASE } from "@/lib/api";
import { supabaseClient } from "@/lib/supabaseClient";

const ORG_KEY = "org_id";

// We keep the old waAccountId naming in the function signatures temporarily 
// to avoid breaking 20+ frontend usages, but under the hood we map it to orgId
export function getSelectedWaAccountId(): string | null {
  if (typeof window === "undefined") return null;
  //after the scaled down we use org_id instead of waAccountId. We keep the old localStorage key for backward compatibility, but we can remove it in the future.
  return localStorage.getItem(ORG_KEY);
}

export function setSelectedWaAccountId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORG_KEY, id);
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  
  const session = data.session;
  if (!session?.access_token) {
    if (typeof window !== "undefined") {
      document.cookie = "sb-access-token=; path=/; max-age=0";
      window.location.href = "/login";
    }
    throw new Error("No active session");
  }

  // Pre-emptive 1-hour expiration check before sending request
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAt > 0 && expiresAt < Date.now()) {
    if (typeof window !== "undefined") {
      document.cookie = "sb-access-token=; path=/; max-age=0";
      await supabaseClient.auth.signOut();
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  return session.access_token;
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  orgId?: string | null;
  isForm?: boolean;
};


// Centralized function to handle authenticated fetch requests with automatic token management and error handling
async function authFetch(path: string, options: FetchOptions = {}) {
  const token = await getAccessToken();
  console.log("Using access token:", token); // Debug log to verify token retrieval
  const orgId = options.orgId ?? getSelectedWaAccountId();
  console.log("Using orgId:", orgId); // Debug log to verify orgId retrieval
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (orgId) {
    headers["x-org-id"] = orgId;
    // We send BOTH headers during this transitional phase so the backend 
    // routes that haven't been updated yet don't break.
    headers["x-wa-account-id"] = orgId; 
  }

  let body: BodyInit | undefined = undefined;
  if (options.isForm && options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body,
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        document.cookie = "sb-access-token=; path=/; max-age=0";
        await supabaseClient.auth.signOut();
        window.location.href = "/login";
      }
    }
    const message = parsed?.error || parsed?.message || text || "Request failed";
    throw new Error(message);
  }

  return parsed;
}

export async function backendPostJson<T>(
  path: string,
  body: unknown,
  waAccountId?: string | null
): Promise<T> {
  return authFetch(path, { method: "POST", body, orgId: waAccountId });
}

export async function backendPostForm<T>(
  path: string,
  formData: FormData,
  waAccountId?: string | null
): Promise<T> {
  return authFetch(path, { method: "POST", body: formData, isForm: true, orgId: waAccountId });
}

export async function backendGet<T>(
  path: string,
  waAccountId?: string | null
): Promise<T> {
  return authFetch(path, { method: "GET", orgId: waAccountId });
}

