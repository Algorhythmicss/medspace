import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import ConnectionBanner from "@/components/ConnectionBanner";
import TabBar from "@/components/TabBar";
import "./globals.css";

// Pairing: a warm geometric for headings (personality, Headspace-adjacent)
// against a neutral grotesque for data (legible small, good tabular figures).
// Both self-hosted by next/font — no third-party request on a clinic's
// unreliable connection.
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "medSpace",
  description: "The memory layer for your practice",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f7f6f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col print:max-w-none">
          <ConnectionBanner />
          <main className="flex-1 pb-28 print:pb-0">{children}</main>
          <TabBar />
        </div>
      </body>
    </html>
  );
}
