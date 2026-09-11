import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkGate } from "@/components/providers/ClerkGate";
import { isClerkConfigured } from "@/lib/auth/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AegisFlow Ops",
  description:
    "IEEE Response Quest #5395 — real-time multi-agent wildfire situational awareness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkEnabled = isClerkConfigured();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-ops-bg text-foreground`}
      >
        <ClerkGate enabled={clerkEnabled}>{children}</ClerkGate>
      </body>
    </html>
  );
}
