import { getRequiredSession } from "@/lib/auth-utils";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/topbar";
import { PageTransition } from "@/components/layout/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <SidebarNav user={session.user} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={session.user} />

        {/* Page content — generous padding, max-width constraint */}
        <main className="flex-1 px-5 py-6 lg:px-7 lg:py-7 overflow-auto">
          <div className="max-w-[1600px] mx-auto">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
