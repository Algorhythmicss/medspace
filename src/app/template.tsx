"use client";

// A template (unlike a layout) re-mounts on every navigation, so wrapping the
// page in it makes each screen play the `page-enter` spring as it arrives —
// the app stops hard-cutting between routes. The nav chrome (Sidebar / TabBar)
// lives in the layout above this, so it stays fixed while only the content
// transitions: the calm, native feel of a tab switch rather than a page load.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
