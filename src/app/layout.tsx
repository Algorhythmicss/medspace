import type { Metadata, Viewport } from "next";
import ConnectionBanner from "@/components/ConnectionBanner";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "medSpace",
  description: "The memory layer for your practice",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col print:max-w-none">
          <ConnectionBanner />
          <main className="flex-1 pb-24 print:pb-0">{children}</main>
          <TabBar />
        </div>
      </body>
    </html>
  );
}
