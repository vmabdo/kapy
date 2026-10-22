import { redirect } from "next/navigation";

interface Props {
  params: { id: string };
}

/** Legacy duplicate route; redirect to the canonical rep detail page. */
export default function LegacySalesRepDetailPage({ params }: Props) {
  redirect(`/dashboard/sales-reps/${params.id}`);
}
