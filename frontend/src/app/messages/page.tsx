"use client";

import { useEffect, useState, useRef } from "react";
import { backendGet, backendPostJson } from "@/lib/backendClient";
import { getSelectedWaAccountId } from "@/lib/backendClient";

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

function formatTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } else if (messageDate.getTime() === today.getTime() - 86400000) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

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
  const displayName = contact?.name || contact?.wa_number || "Unknown";
  const lastMessage = conversation.last_message_preview || "No messages yet";
  const time = formatTime(conversation.last_message_at);

  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-3 border-b border-gray-200 px-4 py-3 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 ${
        isSelected ? "bg-gray-100 dark:bg-gray-800" : ""
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
        <span className="text-lg font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {displayName}
          </h3>
          {time && (
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {time}
            </span>
          )}
        </div>
        <p className="truncate text-sm text-gray-500 dark:text-gray-400">
          {lastMessage}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  const time = formatTime(message.created_at);

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2 px-4`}
    >
      <div
        className={`max-w-[65%] rounded-lg px-3 py-2 ${
          isOwn
            ? "bg-green-500 text-white"
            : "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.body || ""}
        </p>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-xs ${
            isOwn ? "text-green-100" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <span>{time}</span>
          {isOwn && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 15"
              fill="none"
              className="ml-1"
            >
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

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const waAccountId = getSelectedWaAccountId();
      if (!waAccountId) {
        setError("Please select a WhatsApp account first");
        setLoading(false);
        return;
      }

      const response = await backendGet<{ ok: boolean; conversations: Conversation[] }>(
        "/api/conversations",
        waAccountId
      );

      if (response.ok) {
        setConversations(response.conversations);
        if (response.conversations.length > 0 && !selectedConversation) {
          setSelectedConversation(response.conversations[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      setMessagesLoading(true);
      const waAccountId = getSelectedWaAccountId();
      if (!waAccountId) {
        setError("Please select a WhatsApp account first");
        return;
      }

      const response = await backendGet<{ ok: boolean; messages: Message[] }>(
        `/api/messages/${conversationId}`,
        waAccountId
      );

      if (response.ok) {
        setMessages(response.messages);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  };
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      setIsSending(true);
      const waAccountId = getSelectedWaAccountId();
      
      const tempMessage: Message = {
        id: "temp-" + Date.now(),
        conversation_id: selectedConversation.id,
        direction: "outbound",
        sender_type: "agent",
        body: newMessage.trim(),
        message_type: "text",
        ai_used: false,
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, tempMessage]);
      setNewMessage("");

      const response = await backendPostJson<{ ok: boolean; message: Message }>(
        `/api/messages/send`,
        { 
          conversationId: selectedConversation.id,
          text: tempMessage.body
        },
        waAccountId
      );

      // Optionally refresh after sending
      // fetchMessages(selectedConversation.id);
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      fetchMessages(selectedConversation.id); // Refresh if optimistic update failed
    } finally {
      setIsSending(false);
    }
  };
  const selectedContact = selectedConversation?.contacts;
  const displayName = selectedContact?.name || selectedContact?.wa_number || "Select a conversation";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Left Panel - Conversations List */}
      <div className="flex w-1/3 flex-col border-r border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Chats
          </h2>
          <button
            onClick={fetchConversations}
            className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Refresh"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-gray-600 dark:text-gray-400"
            >
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
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

      {/* Right Panel - Chat View */}
      <div className="flex flex-1 flex-col bg-gray-100 dark:bg-gray-900">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 border-b border-gray-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                <span className="text-base font-semibold">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {displayName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedContact?.wa_number}
                </p>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-green-500 border-r-transparent"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Loading messages...
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                <div className="py-4">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.direction === "outbound"}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="bg-gray-200 px-4 py-3 pb-8 dark:bg-gray-800">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message"
                  className="flex-1 rounded-lg border-none px-4 py-2 focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || isSending}
                  className="rounded-full bg-green-500 p-2 text-white hover:bg-green-600 disabled:opacity-50"
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
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-gray-400"
                >
                  <path
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
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
