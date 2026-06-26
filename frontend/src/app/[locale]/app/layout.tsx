import { AuthProvider } from '@/components/providers/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';

export default function UserAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider realm="user">
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
