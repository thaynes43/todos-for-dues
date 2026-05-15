import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TODOs for Dues',
  description: 'Per-chapter Greek-life dues-credit job board.',
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
