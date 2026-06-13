import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Sakhi - Women's Healthcare Helpline",
  description:
    "A free, confidential voice-first healthcare helpline connecting women in remote areas with care, powered by Grok.",
};

const navLinks = [
  { href: "/call", label: "Helpline" },
  { href: "/dashboard", label: "NGO Dashboard" },
  { href: "/trace", label: "Traceability" },
];

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
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur sticky top-0 z-50">
          <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--primary)] text-white font-bold">
                S
              </span>
              <span className="font-semibold text-lg tracking-tight">
                Sakhi
              </span>
              <span className="text-xs text-[var(--muted)] hidden sm:inline">
                Women&apos;s Healthcare Helpline
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
          Sakhi - a government + NGO initiative concept. Free and confidential.
        </footer>
      </body>
    </html>
  );
}
