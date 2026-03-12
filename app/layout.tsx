import type { Metadata } from 'next';
import Image from 'next/image';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contentfill',
  description: 'Bulk field migration tool for Contentful',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const environment = process.env.CONTENTFUL_ENVIRONMENT ?? 'master';
  const isMaster = environment === 'master';

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Image src="/contentfill.png" alt="Contentfill" width={140} height={32} className="h-8 w-auto" priority />
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isMaster
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
                }`}
            >
              {environment}
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
