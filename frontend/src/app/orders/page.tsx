"use client";

import { useState, useEffect, useCallback } from "react";
import { backendGet, backendPostJson, backendPatch } from "@/lib/backendClient";
import type { Order, OrderStatus } from "@/lib/types";
import { API_BASE } from "@/lib/api";
import { getSelectedWaAccountId } from "@/lib/backendClient";
import { supabaseClient } from "@/lib/supabaseClient";

const STATUS_TABS: { label: string; value: OrderStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending Payment", value: "pending_payment" },
  { label: "Receipt Submitted", value: "receipt_submitted" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Delivering", value: "delivering" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  pending_payment: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  receipt_submitted: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  delivering: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  pending_payment: "Pending Payment",
  receipt_submitted: "Receipt Submitted",
  confirmed: "Confirmed",
  delivering: "Delivering",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const NEXT_STATUS_OPTIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  confirmed: ["delivering"],
  delivering: ["delivered"],
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await backendGet<{ ok: boolean; orders: Order[]; total: number }>(
        `/api/orders?${params}`
      );
      if (res.ok) {
        setOrders(res.orders);
        setTotal(res.total);
      }
    } catch {
      setToast({ message: "Failed to load orders", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadOrderDetail = async (orderId: string) => {
    setDetailLoading(true);
    setReceiptUrl(null);
    try {
      const res = await backendGet<{ ok: boolean; order: Order }>(`/api/orders/${orderId}`);
      if (res.ok) {
        setSelectedOrder(res.order);

        if (
          res.order.status === "receipt_submitted" ||
          res.order.receipts?.some((r) => r.status === "pending")
        ) {
          const receiptRes = await backendGet<{ ok: boolean; receipt: { has_media: boolean } }>(
            `/api/orders/${orderId}/receipt`
          );
          if (receiptRes.ok && receiptRes.receipt?.has_media) {
            const orgId = getSelectedWaAccountId();
            const { data: session } = await supabaseClient.auth.getSession();
            const token = session?.session?.access_token;
            setReceiptUrl(
              `${API_BASE}/api/orders/${orderId}/receipt?download=true&token=${token || ""}`
            );
          }
        }
      }
    } catch {
      setToast({ message: "Failed to load order details", type: "error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApproveReceipt = async (orderId: string) => {
    if (!confirm("Approve this payment receipt?")) return;
    setActionLoading(true);
    try {
      await backendPostJson(`/api/orders/${orderId}/approve-receipt`, {});
      setToast({ message: "Receipt approved — customer notified via WhatsApp", type: "success" });
      fetchOrders();
      loadOrderDetail(orderId);
    } catch {
      setToast({ message: "Failed to approve receipt", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectReceipt = async (orderId: string) => {
    const notes = prompt("Reason for rejection (optional):");
    if (notes === null) return;
    setActionLoading(true);
    try {
      await backendPostJson(`/api/orders/${orderId}/reject-receipt`, { notes });
      setToast({ message: "Receipt rejected — customer notified via WhatsApp", type: "success" });
      fetchOrders();
      loadOrderDetail(orderId);
    } catch {
      setToast({ message: "Failed to reject receipt", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    setActionLoading(true);
    try {
      await backendPatch(`/api/orders/${orderId}/status`, { status: newStatus });
      setToast({ message: `Order status updated to ${STATUS_LABELS[newStatus]}`, type: "success" });
      fetchOrders();
      loadOrderDetail(orderId);
    } catch {
      setToast({ message: "Failed to update status", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4 p-6 lg:p-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Left: Order List */}
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Orders</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{total} orders total</p>
        </div>

        {/* Status Tabs */}
        <div className="mb-4 flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value as OrderStatus | ""); setPage(1); setSelectedOrder(null); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === tab.value
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Order List */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-slate-400">Loading...</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No orders found</p>
          ) : (
            orders.map((order) => (
              <button
                key={order.id}
                onClick={() => loadOrderDetail(order.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedOrder?.id === order.id
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-500/5"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">
                    Order #{order.order_number}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{order.contacts?.name || order.contacts?.wa_number || "Unknown"}</span>
                  <span>${Number(order.subtotal).toFixed(2)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{formatDate(order.created_at)}</div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Page {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Prev</button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Order Detail */}
      <div className="hidden w-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 lg:block">
        {!selectedOrder ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            Select an order to view details
          </div>
        ) : detailLoading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Loading...</div>
        ) : (
          <div>
            {/* Order Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Order #{selectedOrder.order_number}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formatDate(selectedOrder.created_at)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[selectedOrder.status]}`}>
                {STATUS_LABELS[selectedOrder.status]}
              </span>
            </div>

            {/* Customer */}
            <div className="mb-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <h3 className="mb-1 text-xs font-medium uppercase text-slate-400">Customer</h3>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {selectedOrder.contacts?.name || "Unknown"}
              </p>
              <p className="text-xs text-slate-500">{selectedOrder.contacts?.wa_number}</p>
            </div>

            {/* Items */}
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium uppercase text-slate-400">Items</h3>
              <div className="space-y-2">
                {selectedOrder.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {item.books?.title || "Unknown Book"}
                      </p>
                      <p className="text-xs text-slate-500">{item.books?.author}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        ${(Number(item.unit_price) * item.quantity).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} x ${Number(item.unit_price).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
                <span className="font-medium text-slate-600 dark:text-slate-300">Total</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  ${Number(selectedOrder.subtotal).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Receipt */}
            {(selectedOrder.status === "receipt_submitted" ||
              selectedOrder.receipts?.some((r) => r.status === "pending")) && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-medium uppercase text-slate-400">Payment Receipt</h3>
                {receiptUrl && (
                  <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <img
                      src={receiptUrl}
                      alt="Payment receipt"
                      className="max-h-64 w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveReceipt(selectedOrder.id)}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Approve Receipt
                  </button>
                  <button
                    onClick={() => handleRejectReceipt(selectedOrder.id)}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* Status Actions */}
            {NEXT_STATUS_OPTIONS[selectedOrder.status] && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-medium uppercase text-slate-400">Update Status</h3>
                <div className="flex gap-2">
                  {NEXT_STATUS_OPTIONS[selectedOrder.status]!.map((nextStatus) => (
                    <button
                      key={nextStatus}
                      onClick={() => handleStatusUpdate(selectedOrder.id, nextStatus)}
                      disabled={actionLoading}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Mark as {STATUS_LABELS[nextStatus]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cancel */}
            {selectedOrder.status !== "cancelled" && selectedOrder.status !== "delivered" && (
              <button
                onClick={() => handleStatusUpdate(selectedOrder.id, "cancelled")}
                disabled={actionLoading}
                className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Cancel Order
              </button>
            )}

            {/* Admin Notes */}
            {selectedOrder.admin_notes && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                <h3 className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">Admin Notes</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">{selectedOrder.admin_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
