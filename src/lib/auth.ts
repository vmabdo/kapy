import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

// ─── Validation Schema ───────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ─── Auth.js v5 Configuration ────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Validate incoming credentials shape
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Look up user in the database
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            isActive: true,
            salesRep: {
              select: { id: true },
            },
          },
        });

        if (!user || !user.isActive) return null;

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          salesRepId: user.salesRep?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * jwt callback — called when JWT is created or updated.
     * We persist extra fields (role, salesRepId) into the token
     * so they are always available server-side without a DB call.
     */
    async jwt({ token, user }) {
      if (user) {
        // `user` is only populated on first sign-in
        token.id = user.id as string;
        token.role = (user as { role: UserRole }).role;
        token.salesRepId = (user as { salesRepId: string | null }).salesRepId;
      }
      return token;
    },

    /**
     * session callback — exposes safe fields to the client session.
     */
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.salesRepId = (token.salesRepId as string | null) ?? null;
      }
      return session;
    },
  },
});
