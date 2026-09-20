import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Root page — immediately redirects authenticated users to the dashboard
 * and unauthenticated users to the login page.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
