import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import { NavRefreshProvider } from "@/lib/nav-refresh-context";
import { PwaStatusBanner } from "@/components/pwa-status-banner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Sparrows Sport Club",
  description: "Sparrows member and event registration",
  appleWebApp: {
    capable: true,
    title: "Sparrows Sport Club",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/images/volleyball.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/images/volleyball.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/images/volleyball.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: "/images/volleyball.png?v=2",
    shortcut: "/images/volleyball.png?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b2f6b" />
        {/* Explicit favicon links (bypass SW/cache confusion); app/icon.png also set for Next.js */}
        <link rel="icon" type="image/png" href="/images/volleyball.png?v=2" sizes="32x32" />
        <link rel="icon" type="image/png" href="/images/volleyball.png?v=2" sizes="192x192" />
        <link rel="shortcut icon" type="image/png" href="/images/volleyball.png?v=2" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          <NavRefreshProvider>
            <Nav />
            <PwaStatusBanner />
            <main className="main-with-nav">{children}</main>
          </NavRefreshProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
