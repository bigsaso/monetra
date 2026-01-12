"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }) {
  // Intended to be the shared layout wrapper for authenticated routes.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 transition-opacity md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <main
        className="relative ml-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden md:ml-64 md:overflow-x-visible"
        aria-label="Main content"
      >
        <div className="sticky top-0 z-20 flex items-center bg-slate-50/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
