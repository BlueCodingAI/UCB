import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Bricolage_Grotesque, Noto_Sans_Devanagari, Noto_Serif_Devanagari, IBM_Plex_Mono } from 'next/font/google';
import { routing, type AppLocale } from '@/i18n/routing';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui';
import { cn } from '@/lib/utils';
import '@/styles/globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const notoSans = Noto_Sans_Devanagari({ subsets: ['latin', 'devanagari'], variable: '--font-noto-deva', display: 'swap' });
const notoSerif = Noto_Serif_Devanagari({
  subsets: ['latin', 'devanagari'],
  weight: ['500', '700'],
  variable: '--font-noto-serif-deva',
  display: 'swap',
});
const ibmMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-ibm-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Disha — Your calm guide through Maharashtra CAP', template: '%s · Disha' },
  description:
    'Multilingual (English, Hindi, Marathi) guidance for the Maharashtra Centralised Admission Process — AI chat & voice grounded only in verified admin knowledge. Unofficial guidance platform.',
  metadataBase: new URL('http://localhost:3000'),
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as AppLocale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(bricolage.variable, notoSans.variable, notoSerif.variable, ibmMono.variable)}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
