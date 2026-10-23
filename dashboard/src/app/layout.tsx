import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevShield | API Gateway & Rate Limiting Console',
  description: 'High-throughput sliding-window API gateway, rate limiting, and observability dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500/20">
        {children}
      </body>
    </html>
  );
}
