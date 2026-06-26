import { AuthProvider } from '@/components/providers/AuthProvider';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <DisclaimerBanner />
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
