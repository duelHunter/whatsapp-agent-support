"use client";

import { useEffect, useRef, useState } from "react";
import { backendGet, backendPostJson, backendPostForm, getSelectedWaAccountId } from "@/lib/backendClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  wa_number: string;
  name: string | null;
}

interface Conversation {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  contacts: Contact | null;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: "user" | "bot" | "agent";
  body: string | null;
  message_type: string;
  ai_used: boolean;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_MEDIA =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime())
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (msgDate.getTime() === today.getTime() - 86400000) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const contact = conversation.contacts;
  const displayName = contact?.name || contact?.wa_number?.split("@")[0] || "Unknown";
  const lastMessage = conversation.last_message_preview || "No messages yet";
  const time = formatTime(conversation.last_message_at);

  return (
    <div
      onClick={onClick}
      className={`group flex cursor-pointer items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 ${
        isSelected
          ? "bg-[#f0f2f5] dark:bg-[#2a3942]"
          : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
        <span className="text-lg font-semibold">{displayName.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</h3>
          {time && <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{time}</span>}
        </div>
        <div className="flex items-center justify-between">
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{lastMessage}</p>
          <span className="translate-x-2 text-gray-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
            <svg viewBox="0 0 19 20" width="19" height="20">
              <path fill="currentColor" d="M3.8 6.7l5.7 5.7 5.7-5.7 1.6 1.6-7.3 7.2-7.3-7.2 1.6-1.6z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const time = formatTime(message.created_at);
  const isMedia = message.message_type !== "text" && message.message_type !== "chat";
  const isImage = message.message_type === "image";

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 px-4`}>
      <div
        className={`max-w-[65%] rounded-lg px-3 py-2 ${
          isOwn ? "bg-green-500 text-white" : "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white"
        }`}
      >
        {isMedia ? (
          <div className="flex items-center gap-2">
            {/* Media icon */}
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                isOwn ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              {isImage ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm2 3H9v-2h8v2z" />
                </svg>
              )}
            </div>
            {/* Caption / filename */}
            <div className="min-w-0">
              <p className="text-xs font-semibold opacity-90">{isImage ? "Image" : "Document"}</p>
              {message.body && (
                <p className="truncate text-sm">{message.body}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{message.body || ""}</p>
        )}

        {/* Timestamp + tick */}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-xs ${
            isOwn ? "text-green-100" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <span>{time}</span>
          {isOwn && (
            <svg width="16" height="16" viewBox="0 0 16 15" fill="none" className="ml-1">
              <path
                d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"
                fill="currentColor"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Attachment preview bar ────────────────────────────────────────────────────

function AttachmentPreview({
  file,
  previewUrl,
  onRemove,
}: {
  file: File;
  previewUrl: string | null;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const sizeKB = (file.size / 1024).toFixed(0);

  return (
    <div className="flex items-center gap-3 border-t border-gray-300 bg-gray-100 px-4 py-2 dark:border-gray-600 dark:bg-gray-700">
      {/* Thumbnail or doc icon */}
      {isImage && previewUrl ? (
        <img src={previewUrl} alt="preview" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-300 dark:bg-gray-600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gray-600 dark:text-gray-300">
            <path
              d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm2 3H9v-2h8v2z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isImage ? "Image" : "Document"} · {sizeKB} KB
        </p>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-white"
        title="Remove attachment"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Attachment state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchConversations(); }, []);
  useEffect(() => { if (selectedConversation) fetchMessages(selectedConversation.id); }, [selectedConversation]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Revoke object URL when attachment changes to avoid memory leaks
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // ── Data fetching ──

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const waAccountId = getSelectedWaAccountId();
      if (!waAccountId) { setError("Please select a WhatsApp account first"); setLoading(false); return; }

      const response = await backendGet<{ ok: boolean; conversations: Conversation[] }>("/api/conversations", waAccountId);
      if (response.ok) {
        setConversations(response.conversations);
        if (response.conversations.length > 0 && !selectedConversation) {
          setSelectedConversation(response.conversations[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      setMessagesLoading(true);
      const waAccountId = getSelectedWaAccountId();
      if (!waAccountId) { setError("Please select a WhatsApp account first"); return; }

      const response = await backendGet<{ ok: boolean; messages: Message[] }>(
        `/api/messages/${conversationId}?org_id=${waAccountId}`,
        waAccountId
      );
      if (response.ok) setMessages(response.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  };

  // ── Attachment handling ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setAttachedFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);

    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(null);
    setPreviewUrl(null);
  };

  // ── Send handling ──

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation) return;
    if (!attachedFile && !newMessage.trim()) return;

    setIsSending(true);
    setError(null);

    try {
      const waAccountId = getSelectedWaAccountId();

      if (attachedFile) {
        // ── Media send ──
        const isImage = attachedFile.type.startsWith("image/");
        const caption = newMessage.trim();

        // Optimistic bubble
        const tempMsg: Message = {
          id: "temp-" + Date.now(),
          conversation_id: selectedConversation.id,
          direction: "outbound",
          sender_type: "agent",
          body: caption || attachedFile.name,
          message_type: isImage ? "image" : "document",
          ai_used: false,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempMsg]);
        setNewMessage("");
        clearAttachment();

        const form = new FormData();
        form.append("file", attachedFile);
        form.append("conversationId", selectedConversation.id);
        if (caption) form.append("caption", caption);

        await backendPostForm<{ ok: boolean; message: Message }>("/api/messages/send-media", form, waAccountId);

      } else {
        // ── Text send ──
        const text = newMessage.trim();
        const tempMsg: Message = {
          id: "temp-" + Date.now(),
          conversation_id: selectedConversation.id,
          direction: "outbound",
          sender_type: "agent",
          body: text,
          message_type: "text",
          ai_used: false,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempMsg]);
        setNewMessage("");

        await backendPostJson<{ ok: boolean; message: Message }>(
          "/api/messages/send",
          { conversationId: selectedConversation.id, text },
          waAccountId
        );
      }
    } catch (err) {
      console.error("Send error:", err);
      setError(err instanceof Error ? err.message : "Failed to send");
      fetchMessages(selectedConversation.id);
    } finally {
      setIsSending(false);
    }
  };

  // ── Derived ──

  const selectedContact = selectedConversation?.contacts;
  const displayName =
    selectedContact?.name ||
    selectedContact?.wa_number?.split("@")[0] ||
    "Select a conversation";

  // ── Render ──

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
          <p className="text-gray-600 dark:text-gray-400">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">

      {/* ── Left panel: conversations ── */}
      <div className="flex w-1/3 flex-col border-r border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chats</h2>
          <button
            onClick={fetchConversations}
            className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Refresh"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600 dark:text-gray-400">
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <div className="px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
          {conversations.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedConversation?.id === conv.id}
                onClick={() => setSelectedConversation(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: chat view ── */}
      <div className="flex flex-1 flex-col bg-gray-100 dark:bg-gray-900">
        {selectedConversation ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                <span className="text-base font-semibold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{displayName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedContact?.wa_number?.split("@")[0]}
                </p>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-green-500 border-r-transparent" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading messages...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-gray-500 dark:text-gray-400">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="py-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} isOwn={msg.direction === "outbound"} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="bg-gray-200 dark:bg-gray-800">
              {/* Attachment preview */}
              {attachedFile && (
                <AttachmentPreview
                  file={attachedFile}
                  previewUrl={previewUrl}
                  onRemove={clearAttachment}
                />
              )}

              {/* Input bar */}
              <form onSubmit={(e) => void handleSend(e)} className="flex items-center gap-2 px-4 py-3 pb-8">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MEDIA}
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Attachment button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending}
                  title="Attach image or document"
                  className="rounded-full p-2 text-gray-500 transition hover:bg-gray-300 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 015 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3.5 3.5 0 007 0V5c0-2.76-2.24-5-5-5S6 2.24 6 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-0.5z" />
                  </svg>
                </button>

                {/* Text / caption input */}
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={attachedFile ? "Add a caption (optional)" : "Type a message"}
                  className="flex-1 rounded-lg border-none px-4 py-2 focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  disabled={isSending}
                />

                {/* Send button */}
                <button
                  type="submit"
                  disabled={isSending || (!newMessage.trim() && !attachedFile)}
                  className="rounded-full bg-green-500 p-2 text-white transition hover:bg-green-600 disabled:opacity-50"
                  title="Send"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block rounded-full bg-gray-200 p-6 dark:bg-gray-700">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                  <path
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                Select a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
