import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guidr",
  description: "A calm second opinion for suspicious messages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
