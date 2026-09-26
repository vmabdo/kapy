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
    <div className="min-h-screen bg-background flex print:block">
      {/* Sidebar — hidden on print */}
      <SidebarNav user={session.user} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 print:block print:w-full">
        <TopBar user={session.user} />

        {/* Page content — generous padding, max-width constraint */}
        <main className="flex-1 px-5 py-6 lg:px-7 lg:py-7 overflow-auto print:p-0 print:overflow-visible">
          <div className="max-w-[1600px] mx-auto print:max-w-full print:mx-0">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );

}
