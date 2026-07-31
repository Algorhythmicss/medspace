"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope, CalendarClock, UserRoundPlus, Lock } from "lucide-react";
import { signOut } from "@/app/actions";

const nav = [
  { href: "/", label: "Today", Icon: Stethoscope },
  { href: "/followups", label: "Follow-ups", Icon: CalendarClock },
  { href: "/patients/new", label: "New patient", Icon: UserRoundPlus },
];

// Desktop navigation. Apple puts persistent navigation in a translucent
// sidebar rather than a bottom bar — a laptop has the width, and a doctor
// at a desk should see where they are without hunting.
export default function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="material fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-hairline px-3 py-5 lg:flex lg:flex-col print:hidden">
      <div className="px-3 pb-6">
        <span className="font-display text-[19px] font-extrabold tracking-[-0.02em]">
          med<span className="text-peri">Space</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className="nav-item ring-focus"
            >
              <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="mt-auto">
        <button type="submit" className="nav-item ring-focus w-full">
          <Lock size={16} strokeWidth={1.9} />
          Lock medSpace
        </button>
      </form>
    </aside>
  );
}
