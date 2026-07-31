"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Clinic internet drops constantly. Say so plainly rather than letting the
// doctor discover it when a save fails.
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-ios-orange px-4 py-1.5 text-[13px] font-semibold text-white print:hidden">
      <WifiOff size={14} strokeWidth={2.4} />
      No connection — your typing is saved on this device
    </div>
  );
}
