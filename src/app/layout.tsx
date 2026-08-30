import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backpack Brawl Optimizer",
  description: "Place bags and items with the production optimizer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
