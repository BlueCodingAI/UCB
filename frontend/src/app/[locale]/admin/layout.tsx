import { AuthProvider } from '@/components/providers/AuthProvider';

/** Admin auth context wraps both the login page and the panel. The AdminShell
 *  (with redirect guard) is applied only inside the (panel) route group so the
 *  login page itself is reachable when unauthenticated. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider realm="admin">{children}</AuthProvider>;
}
