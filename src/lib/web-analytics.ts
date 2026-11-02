import type { BeforeSendEvent } from "@vercel/analytics/next";

// Count navigation, never record-specific or credential-bearing medical pages.
const pagePaths = new Set([
  "/", "/welcome", "/welcome/patient", "/welcome/patient/who", "/login",
  "/queue", "/followups", "/setup", "/patients/new", "/patients/import",
]);

export function isAnalyticsPage(pathname: string | null): boolean {
  return pathname !== null && pagePaths.has(pathname);
}

export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (!isAnalyticsPage(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
