"use client";

import Link from "next/link";

export default function SidebarNavItem({ href, label, icon: Icon, active }) {
  const baseClasses =
    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";
  const activeClasses = "bg-slate-900 text-white shadow-sm";
  const inactiveClasses = "text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
