"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope, CalendarClock, UserRoundPlus } from "lucide-react";

const tabs = [
  { href: "/", label: "Today", Icon: Stethoscope },
  { href: "/followups", label: "Follow-ups", Icon: CalendarClock },
  { href: "/patients/new", label: "New patient", Icon: UserRoundPlus },
];

export default function TabBar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)] print:hidden">
      {/* floats on a soft veil rather than sitting behind a hard divider */}
      <div className="absolute inset-0 bg-paper/85 backdrop-blur-xl" />
      <div className="relative mx-auto flex max-w-md items-stretch justify-around px-2 pb-1.5 pt-2">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 transition-transform active:scale-95"
            >
              <span
                className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primarysoft text-primary" : "text-ink3"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span
                className={`text-[10.5px] font-medium ${active ? "text-primary" : "text-ink3"}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
