import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SUVARNA — Jewellery Business OS',
  description: 'Multi-tenant SaaS platform for jewellery retailers in India',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-[#fff8f1] text-[#25203a]">
        {children}
      </body>
    </html>
  );
}
