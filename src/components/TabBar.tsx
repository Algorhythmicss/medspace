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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-[0.5px] border-hairline bg-white/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl print:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 active:opacity-60 ${
                active ? "text-accent" : "text-label2"
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
