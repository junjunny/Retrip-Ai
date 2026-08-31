import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { appConfig } from "@/config/app";

export const metadata: Metadata = {
  title: appConfig.name,
  description: appConfig.slogan,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
