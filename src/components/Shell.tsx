"use client";

import { usePathname } from "next/navigation";
import ConnectionBanner from "@/components/ConnectionBanner";
import Sidebar from "@/components/Sidebar";
import TabBar from "@/components/TabBar";

// Two different apps share one deployment. The doctor gets navigation chrome;
// the patient gets a bare, phone-shaped page reached from a WhatsApp link and
// should never see clinic navigation they cannot use.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPatient = pathname.startsWith("/p/") || pathname === "/plan";
  const isPublic = pathname === "/login" || pathname.startsWith("/welcome");
  // The front-desk queue is its own bare screen — staff (and the doctor when
  // they open it directly) get the list, not the full clinic chrome.
  const isQueue = pathname === "/queue" || pathname.startsWith("/queue/");

  if (isPatient) {
    return (
      <main className="mx-auto w-full max-w-[520px] px-4 pt-4">{children}</main>
    );
  }

  if (isPublic) {
    return <main className="mx-auto w-full max-w-[460px] px-4">{children}</main>;
  }

  if (isQueue) {
    return <main className="mx-auto w-full max-w-[560px] px-4">{children}</main>;
  }

  return (
    <>
      <ConnectionBanner />
      <Sidebar />
      <div className="lg:pl-[248px]">
        <main className="mx-auto w-full max-w-md px-4 pb-28 md:max-w-[700px] md:px-6 lg:max-w-[1080px] lg:px-10 lg:pb-16 lg:pt-2 print:max-w-none print:px-0">
          {children}
        </main>
      </div>
      <TabBar />
    </>
  );
}
