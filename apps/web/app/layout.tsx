import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '@/components/Shell';
import { QueryProvider } from '@/components/QueryProvider';
import { SidebarProvider } from '@/components/SidebarContext';
import { ThemeMount } from '@/components/ThemeMount';
import { AuthProvider } from '@/components/AuthContext';

export const metadata: Metadata = {
  title: {
    default: 'OnspaceCRM',
    template: '%s · OnspaceCRM',
  },
  description: 'CRM + lead generation built for SME teams in Bangladesh.',
  applicationName: 'OnspaceCRM',
  authors: [{ name: 'Onspace' }],
  robots: { index: false, follow: false },
};

// Pre-paint theme application — must run BEFORE first paint to avoid the
// flash of light theme. Mirrors the next-themes pattern.
const NO_FLASH_SCRIPT = `
(function() {
  try {
    var m = localStorage.getItem('onspace.theme.v1') || 'system';
    var dark = m === 'dark' || (m === 'system' &&
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var html = document.documentElement;
    if (dark) html.classList.add('dark');
    html.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body
        className="min-h-screen bg-background text-ink antialiased"
        suppressHydrationWarning
      >
        <ThemeMount />
        <QueryProvider>
          <AuthProvider>
            <SidebarProvider>
              <Shell>{children}</Shell>
            </SidebarProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
