"use client";

import { useState, useEffect, useCallback } from "react";
import {
  backendGet,
  backendPostJson,
  backendPatch,
  backendDelete,
} from "@/lib/backendClient";
import type { Book } from "@/lib/types";

type BookFormData = {
  title: string;
  author: string;
  isbn: string;
  category: string;
  description: string;
  price: string;
  stock: string;
};

const emptyForm: BookFormData = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  description: "",
  price: "",
  stock: "0",
};

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [form, setForm] = useState<BookFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const limit = 15;

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await backendGet<{ ok: boolean; books: Book[]; total: number }>(
        `/api/books?${params}`
      );
      if (res.ok) {
        setBooks(res.books);
        setTotal(res.total);
      }
    } catch {
      setToast({ message: "Failed to load books", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await backendGet<{ ok: boolean; categories: string[] }>("/api/books/categories");
      if (res.ok) setCategories(res.categories);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const openCreate = () => {
    setEditingBook(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (book: Book) => {
    setEditingBook(book);
    setForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn || "",
      category: book.category || "",
      description: book.description || "",
      price: String(book.price),
      stock: String(book.stock),
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.author.trim() || !form.price.trim()) {
      setError("Title, author, and price are required.");
      return;
    }

    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      setError("Price must be a valid positive number.");
      return;
    }

    const stock = parseInt(form.stock);
    if (isNaN(stock) || stock < 0) {
      setError("Stock must be a valid non-negative number.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        author: form.author.trim(),
        isbn: form.isbn.trim() || null,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        price,
        stock,
      };

      if (editingBook) {
        await backendPatch(`/api/books/${editingBook.id}`, payload);
        setToast({ message: "Book updated successfully", type: "success" });
      } else {
        await backendPostJson("/api/books", payload);
        setToast({ message: "Book created successfully", type: "success" });
      }

      setShowModal(false);
      fetchBooks();
      fetchCategories();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save book");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (book: Book) => {
    if (!confirm(`Delete "${book.title}"? This will hide it from the catalog.`)) return;
    try {
      await backendDelete(`/api/books/${book.id}`);
      setToast({ message: "Book removed from catalog", type: "success" });
      fetchBooks();
    } catch {
      setToast({ message: "Failed to delete book", type: "error" });
    }
  };

  const totalPages = Math.ceil(total / limit);

  const stockBadge = (stock: number) => {
    if (stock === 0)
      return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">Out of stock</span>;
    if (stock <= 5)
      return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Low ({stock})</span>;
    return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">{stock} in stock</span>;
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === "success"
            ? "bg-emerald-500 text-white"
            : "bg-red-500 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Book Catalog</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your bookstore inventory ({total} books)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
        >
          + Add Book
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by title, author, or ISBN..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Title</th>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Author</th>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Price</th>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Stock</th>
              <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : books.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No books found. Add your first book to get started.</td></tr>
            ) : (
              books.map((book) => (
                <tr key={book.id} className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{book.title}</div>
                    {book.isbn && <div className="text-xs text-slate-400">{book.isbn}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{book.author}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{book.category || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">${Number(book.price).toFixed(2)}</td>
                  <td className="px-4 py-3">{stockBadge(book.stock)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(book)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(book)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded border border-slate-200 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="rounded border border-slate-200 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
              {editingBook ? "Edit Book" : "Add New Book"}
            </h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Author *</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">ISBN</label>
                  <input
                    type="text"
                    value={form.isbn}
                    onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    list="category-list"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <datalist id="category-list">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingBook ? "Update Book" : "Add Book"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
