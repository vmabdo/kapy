import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/alerts — returns last 15 unread alerts
export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [alerts, count] = await Promise.all([
      prisma.alert.findMany({
        where: { status: "UNREAD" },
        orderBy: { triggeredAt: "desc" },
        take: 15,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          triggeredAt: true,
          status: true,
        },
      }),
      prisma.alert.count({ where: { status: "UNREAD" } }),
    ]);

    return NextResponse.json({ alerts, count });
  } catch {
    return NextResponse.json({ alerts: [], count: 0 });
  }
}

// PATCH /api/alerts — mark all unread as READ
export async function PATCH() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.alert.updateMany({
      where: { status: "UNREAD" },
      data: { status: "READ", readAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
