"use client";

import { FormEvent, useMemo, useState } from "react";
import { apiPost, apiPostForm, API_BASE } from "@/lib/api";
import type {
  KbAddTextRequest,
  KbAddTextResponse,
  KbUploadPdfResponse,
} from "@/lib/types";

type Status =
  | { state: "idle"; message?: string }
  | { state: "loading"; message: string }
  | { state: "success"; message: string; addedChunks: number }
  | { state: "error"; message: string };

const initialForm: KbAddTextRequest = { title: "", text: "" };
type UploadStatus =
  | { state: "idle"; message?: string }
  | { state: "loading"; message: string }
  | { state: "success"; message: string; addedChunks: number; pages: number | null }
  | { state: "error"; message: string };

export default function KnowledgeBasePage() {
  const [form, setForm] = useState<KbAddTextRequest>(initialForm);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "",
  });
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    state: "idle",
    message: "",
  });

  const isDisabled = useMemo(
    () => !form.title.trim() || form.text.trim().length < 20,
    [form.title, form.text]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ state: "loading", message: "Uploading and embedding..." });

    try {
      const result = await apiPost<KbAddTextResponse>("/kb/add-text", form);
      setStatus({
        state: "success",
        message: "Added to knowledge base",
        addedChunks: result.addedChunks,
      });
      setForm(initialForm);
    } catch (err) {
      setStatus({
        state: "error",
        message:
          (err as Error).message ||
          "Failed to add text. Check backend server logs.",
      });
    }
  };

  const handlePdfSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pdfFile) return;
    setUploadStatus({ state: "loading", message: "Uploading and parsing PDF..." });

    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      if (pdfTitle.trim()) fd.append("title", pdfTitle.trim());

      const result = await apiPostForm<KbUploadPdfResponse>("/kb/upload-pdf", fd);

      if (!result.ok) {
        throw new Error(result.error || "Upload failed");
      }

      setUploadStatus({
        state: "success",
        message: `Added ${result.addedChunks} chunk(s)`,
        addedChunks: result.addedChunks,
        pages: result.pages,
      });
      setPdfFile(null);
      setPdfTitle("");
    } catch (err) {
      setUploadStatus({
        state: "error",
        message:
          (err as Error).message || "Failed to upload PDF. Check backend logs.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              Knowledge Base
            </span>
            <span>Gemini RAG</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Manage Knowledge Base
          </h1>
          <p className="max-w-3xl text-slate-400">
            Upload business content so the chatbot can ground responses with
            relevant snippets before calling Gemini. Text is chunked and
            embedded into <code>kb.json</code> on the backend.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-500">
                  Add text
                </p>
                <h2 className="text-xl font-semibold text-white">
                  Chunk & embed content
                </h2>
              </div>
              {status.state !== "idle" && (
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    status.state === "loading"
                      ? "bg-amber-500/15 text-amber-300"
                      : status.state === "success"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {status.state === "loading"
                    ? "Working..."
                    : status.state === "success"
                      ? `Added ${status.addedChunks} chunk${
                          status.addedChunks === 1 ? "" : "s"
                        }`
                      : "Error"}
                </span>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                  placeholder="e.g. Pricing plans, business hours"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Text</span>
                <textarea
                  value={form.text}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, text: e.target.value }))
                  }
                  className="h-64 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                  placeholder="Paste FAQs, policy text, product details..."
                  required
                />
                <p className="text-xs text-slate-500">
                  Minimum ~20 characters. Backend will chunk and embed with
                  Gemini&apos;s text-embedding-004 model.
                </p>
              </label>

              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  POST {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/kb/add-text
                </div>
                <button
                  type="submit"
                  disabled={isDisabled || status.state === "loading"}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isDisabled || status.state === "loading"
                      ? "cursor-not-allowed bg-slate-800 text-slate-500"
                      : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  }`}
                >
                  {status.state === "loading" ? "Adding..." : "Add to KB"}
                </button>
              </div>

              {status.state === "error" && (
                <p className="text-sm text-rose-300">{status.message}</p>
              )}
              {status.state === "success" && (
                <p className="text-sm text-emerald-300">
                  {status.message} ({status.addedChunks} chunk
                  {status.addedChunks === 1 ? "" : "s"}).
                </p>
              )}
            </div>
          </form>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-wide text-slate-500">
                How it works
              </p>
              <h3 className="text-lg font-semibold text-white">
                RAG pipeline summary
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>• Backend splits text into chunks with sensible length.</li>
                <li>• Each chunk is embedded via Gemini text-embedding-004.</li>
                <li>• Chunks + vectors are stored in <code>kb.json</code>.</li>
                <li>
                  • On user queries, backend searches KB by cosine similarity and
                  injects top snippets into the prompt.
                </li>
              </ul>
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-xs text-slate-400">
                Tips:
                <ul className="mt-2 space-y-2">
                  <li>• Keep inputs focused (policies, hours, FAQs, product info).</li>
                  <li>
                    • Re-upload updated text; backend simply appends new chunks to
                    the store.
                  </li>
                  <li>
                    • Restart backend if you edit <code>.env</code> or change models.
                  </li>
                </ul>
              </div>
            </div>

            <form
              onSubmit={handlePdfSubmit}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide text-slate-500">
                    Upload PDF
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Auto-chunk & embed file
                  </h2>
                </div>
                {uploadStatus.state !== "idle" && (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      uploadStatus.state === "loading"
                        ? "bg-amber-500/15 text-amber-300"
                        : uploadStatus.state === "success"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {uploadStatus.state === "loading"
                      ? "Processing..."
                      : uploadStatus.state === "success"
                        ? `Added ${uploadStatus.addedChunks} chunk${
                            uploadStatus.addedChunks === 1 ? "" : "s"
                          }`
                        : "Error"}
                  </span>
                )}
              </div>

              <div className="mt-6 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Optional title</span>
                  <input
                    type="text"
                    value={pdfTitle}
                    onChange={(e) => setPdfTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                    placeholder="Defaults to filename if blank"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">PDF file</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Max size ~10MB. Parsed server-side, chunked, and embedded into kb.json.
                  </p>
                </label>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    POST {API_BASE}/kb/upload-pdf
                  </div>
                  <button
                    type="submit"
                    disabled={!pdfFile || uploadStatus.state === "loading"}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      !pdfFile || uploadStatus.state === "loading"
                        ? "cursor-not-allowed bg-slate-800 text-slate-500"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    }`}
                  >
                    {uploadStatus.state === "loading" ? "Uploading..." : "Upload PDF"}
                  </button>
                </div>

                {uploadStatus.state === "error" && (
                  <p className="text-sm text-rose-300">{uploadStatus.message}</p>
                )}
                {uploadStatus.state === "success" && (
                  <p className="text-sm text-emerald-300">
                    {uploadStatus.message}
                    {uploadStatus.pages ? ` (pages: ${uploadStatus.pages})` : ""}
                  </p>
                )}
              </div>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}

