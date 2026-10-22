import { redirect } from "next/navigation";

/**
 * Legacy duplicate route. `/dashboard/sales-reps` is the canonical Sales Reps
 * page; keep this redirect for existing bookmarks and external links.
 */
export default function LegacySalesRepsPage() {
  redirect("/dashboard/sales-reps");
}
