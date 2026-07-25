// T2 — dashboard chrome wrapper. The shell itself is a client component
// (mobile drawer state, useParams, tRPC react-query) so this layout stays as
// a thin server boundary that just renders it. We intentionally don't
// pre-fetch products on the server: the sidebar and topbar derive everything
// from the URL via useParams + the tRPC react-query cache, and a server-side
// fetch would push the entire subtree client-side anyway.

import { SidebarShell } from "@/components/dashboard/sidebar-shell";

export default function ProductDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
