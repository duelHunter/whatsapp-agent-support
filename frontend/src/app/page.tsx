"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { API_BASE } from "@/lib/api";
import { getSelectedWaAccountId, backendGet, backendPatch } from "@/lib/backendClient";
import { WhatsAppAccountStatsResponse } from "@/lib/types";
import { supabaseClient } from "@/lib/supabaseClient";

type WaStatus = {
  connected: boolean;
  qrDataUrl: string | null;
  lastError: string | null;
  updatedAt: number;
  botEnabled?: boolean;
};

const summaryCards = [
  { title: "Bot Status", value: "Online", description: "WhatsApp client + backend", accent: "emerald" },
  { title: "Messages", value: "—", description: "Total processed", accent: "sky" },
  { title: "Active Users", value: "—", description: "Unique contacts", accent: "violet" },
  { title: "Uptime", value: "—", description: "Last session duration", accent: "amber" },
];

type LatestConversation = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  contacts: { id: string; wa_number: string; name: string | null } | null;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const accentMap: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  sky: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/20",
};

export default function DashboardPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current user's role to adjust UI
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then(async (data) => {
        if (data.unauthorized) {
          // Token is missing or invalid, force logout
          document.cookie = "sb-access-token=; path=/; max-age=0";
          await supabaseClient.auth.signOut();
          router.push("/login");
          return;
        }

        if (data.role) setUserRole(data.role);
        console.log("Data", data);
      })
      .catch((err) => console.error("Failed to fetch role", err));
  }, [router]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [waStatus, setWaStatus] = useState<WaStatus>({
    connected: false,
    qrDataUrl: null,
    lastError: null,
    updatedAt: 0,
  });
  const [socketConnected, setSocketConnected] = useState(false);
  const [accountStats, setAccountStats] = useState<{
    total_messages: number;
    total_contacts: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [latestConversations, setLatestConversations] = useState<LatestConversation[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);

  const handleBotToggle = async () => {
    try {
      setTogglingBot(true);
      await backendPatch("/api/bot/toggle");
      // New botEnabled value arrives via Socket.IO wa:status event
    } catch (err) {
      console.error("Failed to toggle bot:", err);
    } finally {
      setTogglingBot(false);
    }
  };

  const socketUrl = useMemo(() => {
    // Extract base URL from API_BASE (e.g., http://localhost:4000)
    try {
      const url = new URL(API_BASE);
      return url.origin;
    } catch {
      return "http://localhost:4000";
    }
  }, []);

  useEffect(() => {
    const newSocket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on("connect", () => {
      console.log("🟢 Socket connected:", newSocket.id);
      setSocketConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("🔴 Socket disconnected");
      setSocketConnected(false);
    });

    newSocket.on("wa:status", (status: WaStatus) => {
      console.log("📡 Received WA status:", status);
      setWaStatus(status);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [socketUrl]);

  const botStatusValue = waStatus.connected ? "Online" : waStatus.qrDataUrl ? "Connecting..." : "Offline";
  const botStatusAccent = waStatus.connected ? "emerald" : waStatus.qrDataUrl ? "amber" : "rose";

  // Fetch account statistics
  const fetchAccountStats = async () => {
    const accountId = getSelectedWaAccountId();
    if (!accountId) {
      setAccountStats(null);
      return;
    }

    try {
      setStatsLoading(true);
      const response = await backendGet<WhatsAppAccountStatsResponse>(
        `/api/whatsapp-accounts/${accountId}/stats`
      );

      if (response.ok && response.stats) {
        setAccountStats({
          total_messages: response.stats.total_messages,
          total_contacts: response.stats.total_contacts,
        });
      } else {
        setAccountStats(null);
      }
    } catch (error) {
      console.error("Failed to fetch account stats:", error);
      setAccountStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchLatestChats = async () => {
    try {
      setChatsLoading(true);
      const response = await backendGet<{ ok: boolean; conversations: LatestConversation[] }>(
        "/api/conversations"
      );
      if (response.ok && response.conversations) {
        setLatestConversations(response.conversations.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to fetch latest chats:", error);
    } finally {
      setChatsLoading(false);
    }
  };

  // Fetch stats and chats on mount
  useEffect(() => {
    void fetchAccountStats();
    void fetchLatestChats();
  }, []);

  // Listen for account selection changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "wa_account_id") {
        void fetchAccountStats();
        void fetchLatestChats();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const isBotStatus = card.title === "Bot Status";
            const isMessages = card.title === "Messages";
            const isActiveUsers = card.title === "Active Users";

            let displayValue = card.value;
            let displayAccent = card.accent;

            if (isBotStatus) {
              displayValue = botStatusValue;
              displayAccent = botStatusAccent;
            } else if (isMessages && accountStats) {
              displayValue = accountStats.total_messages.toLocaleString();
              displayAccent = "sky";
            } else if (isActiveUsers && accountStats) {
              displayValue = accountStats.total_contacts.toLocaleString();
              displayAccent = "violet";
            } else if ((isMessages || isActiveUsers) && statsLoading) {
              displayValue = "Loading...";
            }
            
            return (
              <div
                key={card.title}
                className={`rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 ${accentMap[displayAccent] ?? ""}`}
              >
                <p className="text-sm font-medium">{card.title}</p>
                <p className="mt-2 text-2xl font-semibold">{displayValue}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{card.description}</p>
                {(isMessages || isActiveUsers) && (
                  <div className="mt-3 flex items-center gap-1">
                    {statsLoading ? (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <div className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent"></div>
                        Loading...
                      </div>
                    ) : accountStats ? (
                      <button
                        onClick={() => void fetchAccountStats()}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                        title="Refresh stats"
                      >
                        ↻ Refresh
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">No account selected</span>
                    )}
                  </div>
                )}
                {isBotStatus && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          waStatus.connected
                            ? "bg-emerald-400"
                            : waStatus.qrDataUrl
                              ? "bg-amber-400 animate-pulse"
                              : "bg-rose-400"
                        }`}
                      />
                      <span
                        className={`text-xs ${
                          waStatus.connected
                            ? "text-emerald-200"
                            : waStatus.qrDataUrl
                              ? "text-amber-200"
                              : "text-rose-200"
                        }`}
                      >
                        {waStatus.connected ? "Connected" : waStatus.qrDataUrl ? "Waiting for scan" : "Disconnected"}
                      </span>
                      {!socketConnected && (
                        <span className="ml-auto text-xs text-slate-500">Connecting...</span>
                      )}
                    </div>
                    {userRole === "admin" && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/30 dark:border-slate-700/40">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Auto-reply</span>
                        <button
                          onClick={() => void handleBotToggle()}
                          disabled={togglingBot}
                          title={`Click to ${(waStatus.botEnabled ?? true) ? "disable" : "enable"} auto-reply`}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                            (waStatus.botEnabled ?? true) ? "bg-emerald-500" : "bg-slate-500"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                              (waStatus.botEnabled ?? true) ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {togglingBot ? "..." : (waStatus.botEnabled ?? true) ? "On" : "Off"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {card.title === "Messages" && (
                  <div className="mt-3 text-xs text-slate-500">
                    {accountStats ? "Total processed" : "Select account to view"}
                  </div>
                )}
                {card.title === "Active Users" && (
                  <div className="mt-3 text-xs text-slate-500">
                    {accountStats ? "Unique contacts" : "Select account to view"}
                  </div>
                )}
                {card.title === "Uptime" && (
                  <div className="mt-3 text-xs text-slate-500">
                    Detailed metrics → <span className="font-semibold text-slate-300">/analytics</span>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className={`mt-8 grid grid-cols-1 gap-6 ${userRole === "admin" ? "xl:grid-cols-2" : ""}`}>
          {userRole === "admin" && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Connect WhatsApp
                </p>
                <h2 className="text-xl font-semibold">Scan QR code</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {waStatus.connected
                    ? "WhatsApp is connected and ready."
                    : waStatus.qrDataUrl
                      ? "Scan this QR code with your WhatsApp app to connect."
                      : "Waiting for QR code..."}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  waStatus.connected
                    ? "bg-emerald-500/15 text-emerald-300"
                    : waStatus.qrDataUrl
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {waStatus.connected
                  ? "Connected"
                  : waStatus.qrDataUrl
                    ? "Waiting for scan"
                    : "Disconnected"}
              </span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-[220px_1fr]">
              {waStatus.connected ? (
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="text-2xl">✓</span>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300">Connected</p>
                  </div>
                </div>
              ) : waStatus.qrDataUrl ? (
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <img
                    src={waStatus.qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  {socketConnected ? "Waiting for QR..." : "Connecting..."}
                </div>
              )}
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                {waStatus.connected ? (
                  <>
                    <p className="font-semibold text-emerald-300">WhatsApp is connected!</p>
                    <p>The bot is ready to receive and respond to messages.</p>
                  </>
                ) : waStatus.qrDataUrl ? (
                  <>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Scan the QR code
                    </p>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>Open WhatsApp on your phone.</li>
                      <li>Go to Settings → Linked Devices.</li>
                      <li>Tap "Link a device" and scan the QR displayed here.</li>
                    </ul>
                    {waStatus.lastError && (
                      <p className="mt-2 text-xs text-rose-300">Error: {waStatus.lastError}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Waiting for connection
                    </p>
                    <p>
                      {socketConnected
                        ? "The backend is initializing the WhatsApp client. A QR code will appear shortly."
                        : "Connecting to backend..."}
                    </p>
                    {waStatus.lastError && (
                      <p className="mt-2 text-xs text-rose-300">Error: {waStatus.lastError}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recent Messages
                </p>
                <h2 className="text-xl font-semibold">Latest chats</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Preview recent interactions.
                </p>
              </div>
              <button
                onClick={() => router.push("/messages")}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                View all
              </button>
            </div>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
              {chatsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                  <div className="h-4 w-4 animate-spin rounded-full border border-slate-400 border-t-transparent mr-2" />
                  Loading chats...
                </div>
              ) : latestConversations.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No conversations yet.
                </div>
              ) : (
                latestConversations.map((conv) => {
                  const contact = conv.contacts;
                  const displayName = contact?.name || contact?.wa_number || "Unknown";
                  const initial = displayName[0].toUpperCase();
                  return (
                    <div
                      key={conv.id}
                      onClick={() => router.push("/messages")}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800/80"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {displayName}
                          </span>
                          <span className="ml-2 shrink-0">{formatRelativeTime(conv.last_message_at)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">
                          {conv.last_message_preview || "No messages yet"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

