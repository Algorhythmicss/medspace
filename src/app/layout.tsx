import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import ConnectionBanner from "@/components/ConnectionBanner";
import TabBar from "@/components/TabBar";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

// Display face only. Manrope is a semi-rounded geometric — warm enough for
// Headspace's register, but tight and modern enough to set at 40px without
// looking childish. Body text deliberately uses the system stack (SF Pro on
// Apple hardware) because a display face set at 13px is what made the old
// typography feel cheap.
const display = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "medSpace",
  description: "The memory layer for your practice",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff7ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ConnectionBanner />
        <Sidebar />
        {/* phone: single column · laptop: offset past the sidebar */}
        <div className="lg:pl-[248px]">
          <main className="mx-auto w-full max-w-md px-4 pb-28 lg:max-w-[1080px] lg:px-10 lg:pb-16 lg:pt-2 print:max-w-none print:px-0">
            {children}
          </main>
        </div>
        <TabBar />
      </body>
    </html>
  );
}
