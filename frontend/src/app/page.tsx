"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HealthState = {
  status: "loading" | "ok" | "error";
  message: string;
};

const statCards = [
  {
    title: "Total Messages",
    value: "—",
    hint: "Hook to analytics service later",
  },
  {
    title: "Active Users",
    value: "—",
    hint: "Counts unique WhatsApp senders",
  },
  {
    title: "KB Documents",
    value: "—",
    hint: "Upload from the Knowledge Base tab",
  },
  {
    title: "Embeddings",
    value: "text-embedding-004",
    hint: "Gemini model for RAG search",
  },
];

const quickLinks = [
  {
    title: "Check Backend Health",
    desc: "Verify Express + WhatsApp client are up",
    href: "/health",
  },
  {
    title: "Manage Knowledge Base",
    desc: "Upload text to chunk + embed into kb.json",
    href: "/kb",
  },
  {
    title: "View Conversations",
    desc: "Plan for message history & analytics",
    href: "#",
  },
];

export default function Home() {
  const [health, setHealth] = useState<HealthState>({
    status: "loading",
    message: "Checking backend...",
  });

  const apiBase = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_API_BASE_URL ??
        "http://localhost:4000") as string,
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const res = await fetch(`${apiBase}/`, { signal: controller.signal });
        const text = await res.text();
        setHealth({
          status: res.ok ? "ok" : "error",
          message: text || (res.ok ? "Backend responded" : "Unknown issue"),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setHealth({
          status: "error",
          message: "Backend not reachable. Check dev server.",
        });
      }
    };

    void run();
    return () => controller.abort();
  }, [apiBase]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              Admin
            </span>
            <span>WhatsApp AI Bot</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Operations Dashboard
          </h1>
          <p className="max-w-3xl text-slate-400">
            Monitor the WhatsApp chatbot, check backend health, and manage the
            RAG knowledge base powered by Gemini.
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm"
            >
              <div className="text-sm text-slate-400">{card.title}</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {card.value}
              </div>
              <p className="mt-3 text-xs text-slate-500">{card.hint}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide text-slate-500">
                    System Health
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Backend status
                  </h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    health.status === "ok"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : health.status === "loading"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {health.status === "loading"
                    ? "Checking..."
                    : health.status === "ok"
                      ? "Online"
                      : "Offline"}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-300">{health.message}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm text-slate-400">WhatsApp Client</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    LocalAuth session
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ensure QR is scanned on first run; nodemon restarts keep the
                    session in the browser profile.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm text-slate-400">Gemini API</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    text-embedding-004 · {process.env.NEXT_PUBLIC_GEMINI_MODEL ?? "gemini-1.5-flash"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Keys are loaded from .env; keep secrets server-side.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              Quick actions
            </p>
            <h2 className="text-xl font-semibold text-white">
              Get to work faster
            </h2>
            <div className="mt-4 space-y-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  className="block rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-emerald-500/60 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {link.title}
                      </p>
                      <p className="text-xs text-slate-500">{link.desc}</p>
                    </div>
                    <span className="text-sm text-emerald-300">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              Knowledge base
            </p>
            <h3 className="text-lg font-semibold text-white">
              RAG readiness
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Upload text snippets to chunk and embed into <code>kb.json</code>.
              The backend will pull the most relevant snippets before sending
              prompts to Gemini.
            </p>
            <div className="mt-4 space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Chunking helper in backend/kb.js</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Cosine similarity search for top matches</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Embeddings stored locally with metadata</span>
              </div>
            </div>
            <Link
              href="/kb"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Open Knowledge Base
              <span>→</span>
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              Roadmap
            </p>
            <h3 className="text-lg font-semibold text-white">
              Coming soon
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>• Conversation history with message transcripts</li>
              <li>• Analytics for response time and deflection rate</li>
              <li>• Configurable bot persona and business metadata</li>
              <li>• File upload to auto-chunk docs into the KB</li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Want something prioritized? Add an issue or ping in chat.
          </p>
        </div>
        </section>
        </div>
    </div>
  );
}
