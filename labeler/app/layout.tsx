import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mortgage Complaint Labeler',
  description: 'Manual classification of CFPB mortgage complaints',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
