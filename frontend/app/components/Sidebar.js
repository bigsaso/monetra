"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import SidebarNavItem from "./SidebarNavItem";
import SignOutButton from "./SignOutButton";

const navItems = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/accounts", label: "Accounts", icon: AccountsIcon },
  { href: "/transactions", label: "Transactions", icon: TransactionsIcon },
  { href: "/recurring", label: "Recurring schedules", icon: CalendarIcon },
  { href: "/investments", label: "Investments", icon: InvestmentsIcon },
  { href: "/budget", label: "Settings", icon: SettingsIcon }
];

const isRouteActive = (pathname, href) => {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200/80 bg-white/90 px-4 py-6 backdrop-blur">
      <div className="px-2 pb-6">
        <div className="flex flex-col items-start gap-3">
          <Image src="/logo.svg" alt="Monetra" width={128} height={128} />
          <p className="text-lg font-semibold text-slate-900">Monetra</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isRouteActive(pathname, item.href)}
          />
        ))}
      </nav>
      <div className="mt-6">
        <SignOutButton className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800" />
      </div>
    </aside>
  );
}

function HomeIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 10.5L12 4l9 6.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  );
}

function AccountsIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17" />
      <path d="M7.5 14.5h4" />
    </svg>
  );
}

function TransactionsIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h10" />
      <path d="M10 3l4 4-4 4" />
      <path d="M20 17H10" />
      <path d="M14 13l-4 4 4 4" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 9h17" />
      <path d="M8 13h4" />
    </svg>
  );
}

function InvestmentsIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 16l5-5 4 4 7-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.2-1.7l2-1.6-2-3.4-2.4.7a7.6 7.6 0 0 0-3-1.7L13 2h-4l-.4 2.3a7.6 7.6 0 0 0-3 1.7l-2.4-.7-2 3.4 2 1.6A7 7 0 0 0 3 12c0 .6.1 1.2.2 1.7l-2 1.6 2 3.4 2.4-.7a7.6 7.6 0 0 0 3 1.7L9 22h4l.4-2.3a7.6 7.6 0 0 0 3-1.7l2.4.7 2-3.4-2-1.6c.1-.5.2-1.1.2-1.7z" />
    </svg>
  );
}
