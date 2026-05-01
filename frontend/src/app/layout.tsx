import type { Metadata } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-orbitron",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-rajdhani",
});

export const metadata: Metadata = {
  title: "MOBSHOW",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${orbitron.variable} ${rajdhani.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
