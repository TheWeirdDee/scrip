import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://scrip-three.vercel.app'),
  title: "Scrip — Private ownership, provable outcomes",
  description: "Confidential cap tables and private revenue distribution, with publicly provable totals.",
  openGraph: {
    title: 'Scrip — Private ownership, provable outcomes',
    description: 'Conditional revenue waterfalls computed confidentially with iExec Nox.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/scrip-logo.png', shortcut: '/scrip-logo.png', apple: '/scrip-logo.png' },
};

// Without this, phones render against a wide default virtual viewport (~980px), so every
// `@media (max-width: ...)` rule in globals.css silently never fires on real devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

