"use client";

import { useState, useMemo } from "react";
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

// Sample data generators
const generateDailyMessages = (days: number): DailyMessageData[] => {
  const data: DailyMessageData[] = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    const incoming = Math.floor(Math.random() * 150) + 50;
    const outgoing = Math.floor(incoming * 0.8) + Math.floor(Math.random() * 30);
    
    data.push({
      date: dateStr,
      incoming,
      outgoing,
      total: incoming + outgoing,
    });
  }
  
  return data;
};

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
  
  // Calculate days based on date range
  const days = useMemo(() => {
    switch (dateRange) {
      case "today":
        return 1;
      case "7days":
        return 7;
      case "30days":
        return 30;
      default:
        return 7;
    }
  }, [dateRange]);

  // Generate sample data
  const dailyMessages = useMemo(() => generateDailyMessages(days), [days]);
  const kbUsage = useMemo(() => generateKBUsage(), [dateRange]);
  const topConversations = useMemo(() => generateTopConversations(), [dateRange]);
  const topKBDocuments = useMemo(() => generateTopKBDocuments(), [dateRange]);

  // Calculate KPIs
  const totalMessages = useMemo(() => {
    return dailyMessages.reduce((sum, day) => sum + day.total, 0);
  }, [dailyMessages]);

  const incomingMessages = useMemo(() => {
    return dailyMessages.reduce((sum, day) => sum + day.incoming, 0);
  }, [dailyMessages]);

  const outgoingMessages = useMemo(() => {
    return dailyMessages.reduce((sum, day) => sum + day.outgoing, 0);
  }, [dailyMessages]);

  const avgResponseTime = useMemo(() => {
    // Sample: average response time in seconds
    return Math.floor(Math.random() * 120) + 30; // 30-150 seconds
  }, [dateRange]);

  const activeConversations = useMemo(() => {
    // Conversations with messages in last 24h
    return Math.floor(Math.random() * 50) + 20; // 20-70
  }, [dateRange]);

  const totalConversations = useMemo(() => {
    return Math.floor(Math.random() * 200) + 150; // 150-350
  }, [dateRange]);

  const newConversationsToday = useMemo(() => {
    return Math.floor(Math.random() * 15) + 5; // 5-20
  }, [dateRange]);

  const newConversationsLast7Days = useMemo(() => {
    return Math.floor(Math.random() * 50) + 30; // 30-80
  }, [dateRange]);

  const connectedAccounts = useMemo(() => {
    return Math.floor(Math.random() * 3) + 2; // 2-5
  }, []);

  const disconnectedAccounts = useMemo(() => {
    return Math.floor(Math.random() * 2); // 0-2
  }, []);

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
              Last {days} {days === 1 ? "day" : "days"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Incoming Messages</div>
            <div className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
              {incomingMessages.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {((incomingMessages / totalMessages) * 100).toFixed(1)}% of total
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Outgoing Messages</div>
            <div className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {outgoingMessages.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {((outgoingMessages / totalMessages) * 100).toFixed(1)}% of total
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
        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Conversations</div>
            <div className="mt-2 text-2xl font-bold">{totalConversations}</div>
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <div>New today: {newConversationsToday}</div>
              <div>New last 7 days: {newConversationsLast7Days}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">WhatsApp Accounts</div>
            <div className="mt-2 flex items-center gap-4">
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {connectedAccounts}
                </div>
                <div className="text-xs text-slate-500">Connected</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-400">
                  {disconnectedAccounts}
                </div>
                <div className="text-xs text-slate-500">Disconnected</div>
              </div>
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
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyMessages}>
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
                <Line
                  type="monotone"
                  dataKey="incoming"
                  stroke={COLORS.incoming}
                  strokeWidth={2}
                  name="Incoming"
                />
                <Line
                  type="monotone"
                  dataKey="outgoing"
                  stroke={COLORS.outgoing}
                  strokeWidth={2}
                  name="Outgoing"
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Total"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Incoming vs Outgoing Bar Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Incoming vs Outgoing</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyMessages}>
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
          </div>
        </section>

        {/* KB Usage Pie Chart */}
        <section className="mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Knowledge Base Usage</h3>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={kbUsage}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {kbUsage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
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
