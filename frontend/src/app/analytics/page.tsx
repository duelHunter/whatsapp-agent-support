"use client";

import { useState, useMemo, useEffect } from "react";
import { backendGet, getSelectedWaAccountId } from "@/lib/backendClient";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type DateRange = "today" | "7days" | "30days" | "custom";

interface DailyMessageData {
  date: string;
  incoming: number;
  outgoing: number;
  total: number;
}

interface KBUsageData {
  [key: string]: string | number;
  name: string;
  value: number;
  color: string;
}

interface TopConversation {
  id: string;
  contact: string;
  messageCount: number;
  lastMessage: string;
}

interface TopKBDocument {
  id: string;
  title: string;
  usageCount: number;
  lastUsed: string;
}


const generateKBUsage = (): KBUsageData[] => {
  const kbUsed = Math.floor(Math.random() * 30) + 60; // 60-90%
  return [
    { name: "KB Used", value: kbUsed, color: "#10b981" },
    { name: "Non-KB", value: 100 - kbUsed, color: "#64748b" },
  ];
};

const generateTopConversations = (): TopConversation[] => {
  const contacts = ["John Doe", "Jane Smith", "Alice Johnson", "Bob Williams", "Charlie Brown"];
  return contacts.map((contact, idx) => ({
    id: `conv-${idx + 1}`,
    contact,
    messageCount: Math.floor(Math.random() * 100) + 50,
    lastMessage: new Date(Date.now() - Math.random() * 86400000 * 7).toLocaleString(),
  })).sort((a, b) => b.messageCount - a.messageCount);
};

const generateTopKBDocuments = (): TopKBDocument[] => {
  const docs = [
    "Product Catalog 2024",
    "FAQ - Common Questions",
    "Shipping Policy",
    "Return & Refund Policy",
    "Technical Support Guide",
  ];
  return docs.map((title, idx) => ({
    id: `doc-${idx + 1}`,
    title,
    usageCount: Math.floor(Math.random() * 200) + 30,
    lastUsed: new Date(Date.now() - Math.random() * 86400000 * 3).toLocaleString(),
  })).sort((a, b) => b.usageCount - a.usageCount);
};

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("7days");
  
  // Real data state
  const [realSummary, setRealSummary] = useState({
    totalMessages: 0,
    incomingMessages: 0,
    outgoingMessages: 0,
    totalConversations: 0,
    aiMessages: 0,
    humanMessages: 0,
    loading: true,
  });

  useEffect(() => {
    async function fetchSummary() {
      try {
        const waAccountId = getSelectedWaAccountId();
        if (!waAccountId) return;

        const res = await backendGet<{ ok: boolean; summary: any }>(
          "/api/analytics/summary",
          waAccountId
        );

        if (res.ok && res.summary) {
          setRealSummary({
            totalMessages: res.summary.totalMessages || 0,
            incomingMessages: res.summary.incomingMessages || 0,
            outgoingMessages: res.summary.outgoingMessages || 0,
            totalConversations: res.summary.totalConversations || 0,
            aiMessages: res.summary.aiMessages || 0,
            humanMessages: res.summary.humanMessages || 0,
            loading: false,
          });
        }
      } catch (err) {
        console.error("Failed to fetch analytics summary:", err);
      } finally {
        setRealSummary((prev) => ({ ...prev, loading: false }));
      }
    }
    fetchSummary();
  }, []);

  const [dailyChartData, setDailyChartData] = useState<DailyMessageData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    async function fetchDailyMessages() {
      const waAccountId = getSelectedWaAccountId();
      if (!waAccountId) return;
      setChartLoading(true);
      try {
        const res = await backendGet<{ ok: boolean; data: DailyMessageData[] }>(
          `/api/analytics/messages/daily?dateRange=${dateRange}`,
          waAccountId
        );
        if (res.ok && res.data) {
          setDailyChartData(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch daily chart data:", err);
      } finally {
        setChartLoading(false);
      }
    }
    fetchDailyMessages();
  }, [dateRange]);

  const kbUsage = useMemo(() => generateKBUsage(), [dateRange]);
  const topConversations = useMemo(() => generateTopConversations(), [dateRange]);
  const topKBDocuments = useMemo(() => generateTopKBDocuments(), [dateRange]);

  // Calculate KPIs
  const totalMessages = realSummary.totalMessages;
  const incomingMessages = realSummary.incomingMessages;
  const outgoingMessages = realSummary.outgoingMessages;
  const totalConversations = realSummary.totalConversations;
  const aiMessages = realSummary.aiMessages;
  const humanMessages = realSummary.humanMessages;
  const totalOutgoing = aiMessages + humanMessages;

  const aiRatioData = [
    { name: "AI (Gemini)", value: aiMessages, color: "#10b981" },
    { name: "Human Agent", value: humanMessages, color: "#6366f1" },
  ];

  const avgResponseTime = useMemo(() => {
    // Sample: average response time in seconds
    return Math.floor(Math.random() * 120) + 30; // 30-150 seconds
  }, [dateRange]);

  const activeConversations = useMemo(() => {
    // Conversations with messages in last 24h
    return Math.floor(Math.random() * 50) + 20; // 20-70
  }, [dateRange]);

  const newConversationsToday = useMemo(() => {
    return Math.floor(Math.random() * 15) + 5; // 5-20
  }, [dateRange]);

  const newConversationsLast7Days = useMemo(() => {
    return Math.floor(Math.random() * 50) + 30; // 30-80
  }, [dateRange]);


  const COLORS = {
    incoming: "#3b82f6", // blue
    outgoing: "#10b981", // emerald
    kb: "#10b981",
    nonKb: "#64748b",
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Analytics</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Monitor chatbot usage and performance metrics
            </p>
          </div>
          
          {/* Date Range Selector */}
          <div className="flex gap-2 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(["today", "7days", "30days"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  dateRange === range
                    ? "bg-emerald-500 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {range === "today"
                  ? "Today"
                  : range === "7days"
                  ? "7 Days"
                  : "30 Days"}
              </button>
            ))}
          </div>
        </header>

        {/* KPI Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Messages</div>
            <div className="mt-2 text-3xl font-bold">{totalMessages.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">
              {dateRange === "today" ? "Today" : dateRange === "7days" ? "Last 7 days" : "Last 30 days"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Incoming Messages</div>
            <div className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
              {incomingMessages.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">
                {totalMessages > 0 ? ((incomingMessages / totalMessages) * 100).toFixed(1) : "0.0"}% of total
              </div>
            </div>
  
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm text-slate-600 dark:text-slate-400">Outgoing Messages</div>
              <div className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {outgoingMessages.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {totalMessages > 0 ? ((outgoingMessages / totalMessages) * 100).toFixed(1) : "0.0"}% of total
              </div>
            </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Avg Response Time</div>
            <div className="mt-2 text-3xl font-bold text-violet-600 dark:text-violet-400">
              {formatTime(avgResponseTime)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Between inbound & reply</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Active Conversations</div>
            <div className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">
              {activeConversations}
            </div>
            <div className="mt-1 text-xs text-slate-500">Last 24 hours</div>
          </div>
        </section>

        {/* Additional Stats Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Conversations</div>
            <div className="mt-2 text-2xl font-bold">{totalConversations}</div>
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <div>New today: {newConversationsToday}</div>
              <div>New last 7 days: {newConversationsLast7Days}</div>
            </div>
          </div>

<div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">KB Usage</div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {kbUsage[0].value}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Messages answered using knowledge base
            </div>
          </div>
        </section>

        {/* Charts Section */}
        <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Daily Messages Line Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Messages Per Day</h3>
            {chartLoading ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="incoming" stroke={COLORS.incoming} strokeWidth={2} name="Incoming" />
                  <Line type="monotone" dataKey="outgoing" stroke={COLORS.outgoing} strokeWidth={2} name="Outgoing" />
                  <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" name="Total" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Incoming vs Outgoing Bar Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Incoming vs Outgoing</h3>
            {chartLoading ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="incoming" fill={COLORS.incoming} name="Incoming" />
                  <Bar dataKey="outgoing" fill={COLORS.outgoing} name="Outgoing" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* AI vs Human Ratio Pie Chart */}
        <section className="mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-1 text-lg font-semibold">AI vs. Human Ratio</h3>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Outgoing replies handled automatically by Gemini versus by a human agent.
            </p>

            {realSummary.loading ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">Loading…</div>
            ) : totalOutgoing === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-slate-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="opacity-40">
                  <path d="M11 17h2v-6h-2zm0-8h2V7h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>
                </svg>
                <p className="text-sm">No outgoing messages yet</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-center">
                {/* Pie */}
                <div className="w-full max-w-xs shrink-0">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={aiRatioData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {aiRatioData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | undefined) => [
                          `${value ?? 0} messages (${(((value ?? 0) / totalOutgoing) * 100).toFixed(1)}%)`,
                        ]}
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          color: "#f1f5f9",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend + stats */}
                <div className="flex flex-col gap-4 md:min-w-[220px]">
                  {aiRatioData.map((entry) => {
                    const pct = totalOutgoing > 0 ? (entry.value / totalOutgoing) * 100 : 0;
                    return (
                      <div key={entry.name} className="flex items-center gap-3">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {entry.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {entry.value.toLocaleString()} messages &mdash;{" "}
                            <span className="font-semibold" style={{ color: entry.color }}>
                              {pct.toFixed(1)}%
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total outgoing replies</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {totalOutgoing.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Tables Section */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top Conversations */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h3 className="text-lg font-semibold">Top Conversations</h3>
              <p className="text-sm text-slate-500">By message count</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Messages
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Last Message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {topConversations.map((conv) => (
                    <tr key={conv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                        {conv.contact}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {conv.messageCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {conv.lastMessage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top KB Documents */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h3 className="text-lg font-semibold">Top KB Documents</h3>
              <p className="text-sm text-slate-500">Most frequently used</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Document
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Usage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      Last Used
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {topKBDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                        {doc.title}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {doc.usageCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {doc.lastUsed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
