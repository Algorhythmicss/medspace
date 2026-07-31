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
    <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 print:hidden">
      {/* a floating pill, not a bar bolted to the edge */}
      <div className="mx-auto flex max-w-md items-stretch justify-around rounded-full bg-night px-2 py-2 shadow-[0_14px_34px_-12px_rgba(22,48,91,0.6)]">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1 transition-transform active:scale-95"
            >
              <span
                className={`flex h-9 w-full items-center justify-center rounded-full transition-colors ${
                  active ? "bg-orange text-white" : "text-nightink2"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
              </span>
              <span
                className={`text-[10px] font-semibold ${active ? "text-white" : "text-nightink2"}`}
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
