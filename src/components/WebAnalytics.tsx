"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { filterAnalyticsEvent, isAnalyticsPage } from "@/lib/web-analytics";

export default function WebAnalytics() {
  const pathname = usePathname();
  // Production uses Vercel's same-origin endpoint; keep development local.
  if (process.env.NODE_ENV !== "production" || !isAnalyticsPage(pathname)) return null;
  return <Analytics beforeSend={filterAnalyticsEvent}/>;
}
