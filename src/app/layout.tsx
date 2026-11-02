import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Shell from "@/components/Shell";
import WebAnalytics from "@/components/WebAnalytics";
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
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Shell>{children}</Shell>
        <WebAnalytics />
      </body>
    </html>
  );
}
