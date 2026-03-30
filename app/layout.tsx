import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Modern Website Starter',
  description: 'A clean and responsive website built with Next.js and Tailwind CSS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
