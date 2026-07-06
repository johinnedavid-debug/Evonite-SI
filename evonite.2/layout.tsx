import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Synthetic Intelligence — Embodiment",
  description: "Visual cortex of a self-improving multi-agent AI system",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-si-bg text-slate-300">{children}</body>
    </html>
  );
}
