import Sidebar from "./Sidebar";

export default function AppShell({ children }) {
  // Intended to be the shared layout wrapper for authenticated routes.
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="ml-64 flex-1 overflow-y-auto" aria-label="Main content">
        {children}
      </main>
    </div>
  );
}
