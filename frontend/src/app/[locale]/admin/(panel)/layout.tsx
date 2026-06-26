import { AdminShell } from '@/components/layout/AdminShell';

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
