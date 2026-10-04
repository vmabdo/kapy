import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export const getSystemSettings = unstable_cache(
  async () => {
    return prisma.appSettings.findFirst();
  },
  ["system-settings"],
  { tags: ["settings"] }
);
