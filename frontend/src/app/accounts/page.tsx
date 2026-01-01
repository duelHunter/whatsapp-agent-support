"use client";

import { useEffect, useState } from "react";
import { WaAccount, WaAccountStats, WhatsAppAccountsResponse, WhatsAppAccountStatsResponse, CreateWhatsAppAccountRequest } from "@/lib/types";
import { getSelectedWaAccountId, setSelectedWaAccountId, backendGet, backendPostJson } from "@/lib/backendClient";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [selectedStats, setSelectedStats] = useState<Record<string, WaAccountStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setSelected(getSelectedWaAccountId());
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await backendGet<WhatsAppAccountsResponse>("/api/whatsapp-accounts");
      
      if (response.ok && response.accounts) {
        setAccounts(response.accounts);
        
        // Auto-select first account if none selected
        if (!selected && response.accounts.length > 0) {
          const firstId = response.accounts[0].id;
          setSelectedWaAccountId(firstId);
          setSelected(firstId);
        }
      } else {
        setAccounts([]);
      }
    } catch (err) {
      setError((err as Error).message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const loadStats = async (accountId: string) => {
    try {
      const response = await backendGet<WhatsAppAccountStatsResponse>(
        `/api/whatsapp-accounts/${accountId}/stats`
      );
      
      if (response.ok && response.stats) {
        setSelectedStats((prev) => ({
          ...prev,
          [accountId]: response.stats,
        }));
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedWaAccountId(id);
    setSelected(id);
    
    // Load stats for this account if not already loaded
    if (!selectedStats[id]) {
      void loadStats(id);
    }
  };

  const handleCreateAccount = async () => {
    if (!createName.trim()) {
      setError("Display name is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const request: CreateWhatsAppAccountRequest = {
        display_name: createName.trim(),
        notes: createNotes.trim() || undefined,
      };

      await backendPostJson("/api/whatsapp-accounts", request);

      // Reload accounts list
      await loadAccounts();

      // Reset form
      setShowCreateForm(false);
      setCreateName("");
      setCreateNotes("");
    } catch (err) {
      setError((err as Error).message || "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "pending_qr":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "disconnected":
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
      case "error":
        return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return "●";
      case "pending_qr":
        return "◐";
      case "disconnected":
        return "○";
      case "error":
        return "✕";
      default:
        return "○";
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">WhatsApp Accounts</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Manage WhatsApp accounts and view connection status
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            {showCreateForm ? "Cancel" : "+ Create Account"}
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {showCreateForm && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-semibold">Create New WhatsApp Account</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g., Sales Bot"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Notes (Optional)</label>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="e.g., For handling sales inquiries"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <button
                onClick={handleCreateAccount}
                disabled={creating || !createName.trim()}
                className="rounded-lg bg-emerald-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-500">Loading accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-slate-500">No WhatsApp accounts found.</p>
            <p className="mt-2 text-sm text-slate-400">
              Create an account to get started with WhatsApp messaging.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acct) => {
              const stats = selectedStats[acct.id];
              const isSelected = selected === acct.id;

              return (
                <div
                  key={acct.id}
                  className={`rounded-xl border p-6 shadow-sm transition ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500/5 dark:bg-emerald-500/10"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">
                        {acct.display_name || "Unnamed Account"}
                      </h3>
                      {acct.phone_number && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {acct.phone_number}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(
                        acct.status
                      )}`}
                    >
                      {getStatusIcon(acct.status)} {acct.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Connection Info */}
                  <div className="mb-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Last Connected:</span>
                      <span className="font-medium">{formatDate(acct.last_connected_at)}</span>
                    </div>
                    {acct.status === "pending_qr" && acct.last_qr_at && (
                      <div className="flex justify-between">
                        <span>QR Generated:</span>
                        <span className="font-medium">{formatDate(acct.last_qr_at)}</span>
                      </div>
                    )}
                    {acct.notes && (
                      <div className="mt-2 rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">
                        {acct.notes}
                      </div>
                    )}
                  </div>

                  {/* Statistics */}
                  {stats && (
                    <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Messages</div>
                        <div className="font-semibold">{stats.total_messages}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Chats</div>
                        <div className="font-semibold">{stats.total_conversations}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Contacts</div>
                        <div className="font-semibold">{stats.total_contacts}</div>
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => handleSelect(acct.id)}
                    className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-emerald-500 text-white hover:bg-emerald-400"
                        : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    }`}
                  >
                    {isSelected ? "✓ Selected" : "Select Account"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


