import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '@/components/Shell';
import { QueryProvider } from '@/components/QueryProvider';

export const metadata: Metadata = {
  title: 'OnspaceCRM',
  description: 'Lead scraping and CRM platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-ink antialiased"
        suppressHydrationWarning
      >
        <QueryProvider>
          <Shell>{children}</Shell>
        </QueryProvider>
      </body>
    </html>
  );
}
