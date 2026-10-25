import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import "./globals.css";

const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: { default: "AromaOS", template: "%s — AromaOS" },
  description: "Система управления аромамаркетингом: лиды, клиенты, объекты, подписки, сервис",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#101312" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${golos.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
