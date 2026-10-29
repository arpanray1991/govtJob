import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { GuestAnalytics } from "@/components/guest-analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Examforge — Your preparation, a step ahead.", template: "%s | Examforge" },
  description: "Purposeful government exam practice. Take realistic SSC and Banking mock tests, review detailed solutions, and turn insights into progress."
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers><Shell>{children}<GuestAnalytics /></Shell></Providers></body></html>;
}
