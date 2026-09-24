import { SentinelProvider } from "@/components/SentinelProvider";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel Insight — CETEC HVAC Monitoring",
  description:
    "Sentinel Insight: 3D model of the CETEC building at Tec de Monterrey with SentinelBox HVAC sensor and maintenance status.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-[#060b16] text-slate-100">
        <SentinelProvider>{children}</SentinelProvider>
      </body>
    </html>
  );
}
