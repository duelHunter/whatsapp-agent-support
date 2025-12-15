"use client";

import { useEffect, useState, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE } from "@/lib/api";

type WaStatus = {
  connected: boolean;
  qrDataUrl: string | null;
  lastError: string | null;
  updatedAt: number;
};

const summaryCards = [
  { title: "Bot Status", value: "Online", description: "WhatsApp client + backend", accent: "emerald" },
  { title: "Messages", value: "—", description: "Total processed", accent: "sky" },
  { title: "Active Users", value: "—", description: "Unique WhatsApp senders", accent: "violet" },
  { title: "Uptime", value: "—", description: "Last session duration", accent: "amber" },
];

const recentMessages = [
  { from: "Bot", time: "04:15", text: "Hello, I'm your virtual assistant...", role: "bot" },
  { from: "User", time: "04:15", text: "hi who are you?", role: "user" },
  { from: "Bot", time: "04:16", text: "I'm here to help you with orders and FAQs.", role: "bot" },
  { from: "User", time: "04:17", text: "What are your packages?", role: "user" },
];

const accentMap: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  sky: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/20",
};

export default function DashboardPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [waStatus, setWaStatus] = useState<WaStatus>({
    connected: false,
    qrDataUrl: null,
    lastError: null,
    updatedAt: 0,
  });
  const [socketConnected, setSocketConnected] = useState(false);

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
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Monitor and control your WhatsApp bot.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const isBotStatus = card.title === "Bot Status";
            const displayValue = isBotStatus ? botStatusValue : card.value;
            const displayAccent = isBotStatus ? botStatusAccent : card.accent;
            
            return (
              <div
                key={card.title}
                className={`rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 ${accentMap[displayAccent] ?? ""}`}
              >
                <p className="text-sm font-medium">{card.title}</p>
                <p className="mt-2 text-2xl font-semibold">{displayValue}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{card.description}</p>
                {isBotStatus && (
                  <div className="mt-3 flex items-center gap-2">
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
                )}
                {card.title === "Messages" && (
                  <div className="mt-3 text-xs text-slate-500">
                    View history → <span className="font-semibold text-slate-300">/messages</span>
                  </div>
                )}
                {card.title === "Active Users" && (
                  <div className="mt-3 text-xs text-slate-500">
                    See analytics → <span className="font-semibold text-slate-300">/analytics</span>
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

        <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
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
              {waStatus.qrDataUrl ? (
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <img
                    src={waStatus.qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : waStatus.connected ? (
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="text-2xl">✓</span>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300">Connected</p>
                  </div>
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
              <button className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                View all
              </button>
            </div>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
              {recentMessages.map((msg, idx) => (
                <div
                  key={`${msg.from}-${idx}`}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      msg.role === "bot"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-slate-700 text-slate-100"
                    }`}
                  >
                    {msg.from[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{msg.from}</span>
                      <span>{msg.time}</span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

