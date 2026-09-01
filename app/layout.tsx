import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earth Explorer",
  description:
    "A science-communication journey around planet Earth, synced to your local solar time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
