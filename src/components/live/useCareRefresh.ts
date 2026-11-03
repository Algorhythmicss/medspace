"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
export function useCareRefresh(version?: string) {
  const router = useRouter(),
    previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!version) return;
    const changed =
      previous.current !== undefined && previous.current !== version;
    previous.current = version;
    if (changed) router.refresh();
  }, [version, router]);
}
