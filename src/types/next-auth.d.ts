import { UserRole } from "@prisma/client";
import type { DefaultSession, DefaultJWT } from "next-auth";

/**
 * Augment the built-in next-auth types to include our custom
 * fields: `id`, `role`, and `salesRepId`.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      salesRepId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    salesRepId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: UserRole;
    salesRepId: string | null;
  }
}
