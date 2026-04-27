import type { Metadata, Viewport } from "next";
import NextTopLoader from 'nextjs-toploader';
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "ChoreApp — Household Chore Tracker",
  description: "Keep your household on track with shared chore lists, streaks, and weekly planning.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ChoreApp",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8e4ff" },
    { media: "(prefers-color-scheme: dark)",  color: "#0d0b1e" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <NextTopLoader color="#7c6af7" showSpinner={false} shadow="0 0 10px #7c6af7,0 0 5px #7c6af7" />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
