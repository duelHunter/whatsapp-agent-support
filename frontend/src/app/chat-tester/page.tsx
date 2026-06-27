"use client";

import { useState, useRef, useEffect } from "react";
import { backendPostJson, backendGet } from "@/lib/backendClient";
import type { AgentMode } from "@/lib/types";

type ToolLog = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  toolLogs?: ToolLog[];
  kbMatches?: { title: string; score: number; text: string }[];
  mode?: string;
};

export default function ChatTesterPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("kb_only");
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    backendGet<{ ok: boolean; agent_mode: AgentMode }>("/api/settings/agent")
      .then((d) => { if (d.ok) setAgentMode(d.agent_mode); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await backendPostJson<{
        ok: boolean;
        reply: string;
        toolLogs: ToolLog[];
        kbMatches?: { title: string; score: number; text: string }[];
        mode: string;
      }>("/api/chat-test", { message: text, history });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.reply,
        toolLogs: res.toolLogs,
        kbMatches: res.kbMatches,
        mode: res.mode,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to get response. Check the backend logs." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setExpandedTools({});
  };

  const toggleToolExpand = (idx: number) => {
    setExpandedTools((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col p-6 lg:p-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Chat Tester</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Test AI responses directly — mode:{" "}
            <span className={`font-medium ${agentMode === "ordering_agent" ? "text-emerald-600" : "text-sky-600"}`}>
              {agentMode === "ordering_agent" ? "Ordering Agent" : "KB Only"}
            </span>
          </p>
        </div>
        <button
          onClick={handleClear}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Clear Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Send a message to test the AI. This does not use WhatsApp.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                {/* Message bubble */}
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>

                {/* Tool Logs (for assistant messages) */}
                {msg.role === "assistant" && msg.toolLogs && msg.toolLogs.length > 0 && (
                  <div className="ml-2 mt-2">
                    <button
                      onClick={() => toggleToolExpand(i)}
                      className="flex items-center gap-1 text-xs font-medium text-violet-600 transition hover:text-violet-700 dark:text-violet-400"
                    >
                      <span>{expandedTools[i] ? "▼" : "▶"}</span>
                      {msg.toolLogs.length} tool call{msg.toolLogs.length > 1 ? "s" : ""}
                    </button>
                    {expandedTools[i] && (
                      <div className="mt-1 space-y-2">
                        {msg.toolLogs.map((log, j) => (
                          <div
                            key={j}
                            className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs dark:border-violet-800 dark:bg-violet-900/20"
                          >
                            <div className="mb-1 font-semibold text-violet-700 dark:text-violet-300">
                              {log.tool}
                            </div>
                            <div className="mb-1">
                              <span className="font-medium text-slate-500">Args: </span>
                              <code className="text-slate-700 dark:text-slate-300">
                                {JSON.stringify(log.args)}
                              </code>
                            </div>
                            <div>
                              <span className="font-medium text-slate-500">Result: </span>
                              <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {JSON.stringify(log.result, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* KB Matches (for kb_only mode) */}
                {msg.role === "assistant" && msg.kbMatches && msg.kbMatches.length > 0 && (
                  <div className="ml-2 mt-2">
                    <button
                      onClick={() => toggleToolExpand(i)}
                      className="flex items-center gap-1 text-xs font-medium text-sky-600 transition hover:text-sky-700 dark:text-sky-400"
                    >
                      <span>{expandedTools[i] ? "▼" : "▶"}</span>
                      {msg.kbMatches.length} KB match{msg.kbMatches.length > 1 ? "es" : ""}
                    </button>
                    {expandedTools[i] && (
                      <div className="mt-1 space-y-1">
                        {msg.kbMatches.map((match, j) => (
                          <div
                            key={j}
                            className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs dark:border-sky-800 dark:bg-sky-900/20"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sky-700 dark:text-sky-300">
                                {match.title}
                              </span>
                              <span className="text-sky-500">
                                score: {match.score?.toFixed(3)}
                              </span>
                            </div>
                            <p className="mt-1 text-slate-600 dark:text-slate-400">
                              {match.text}...
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400 dark:bg-slate-800">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder={agentMode === "ordering_agent" ? "Try: 'Show me programming books'" : "Ask a question..."}
          disabled={loading}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
