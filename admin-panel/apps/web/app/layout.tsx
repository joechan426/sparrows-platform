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
  title: "Sparrows",
  description: "Sparrows member and event registration",
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
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          <NavRefreshProvider>
            <Nav />
            <PwaStatusBanner />
            {children}
          </NavRefreshProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
