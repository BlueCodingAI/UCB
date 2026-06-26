import { AuthProvider } from '@/components/providers/AuthProvider';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/Logo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-ground">
        <header className="flex h-16 items-center justify-between px-5">
          <Link href="/" aria-label="Disha home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <DisclaimerBanner />
      </div>
    </AuthProvider>
  );
}
