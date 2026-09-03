import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/nav.tsx";

export const metadata: Metadata = {
  title: "moss_robotics — performance",
  description: "Instagram performance tracking and benchmarking for @moss_robotics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-6 px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight">@moss_robotics</span>
              <span className="eyebrow">performance</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-[1180px] px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
