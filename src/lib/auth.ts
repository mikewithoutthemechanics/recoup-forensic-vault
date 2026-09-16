import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * Auth stub for multi-tenancy.
 *
 * Today the platform runs in single-tenant demo mode (one org seeded as
 * "Kopano Group"). This module introduces the seam that Better Auth will
 * occupy: `getSession()` and `requireOrgId()` are the only surfaces
 * `agent.ts` and route handlers should touch to resolve the active
 * organisation.
 *
 * TODO(Better Auth): Replace `getSession` with real Better Auth session
 * lookup (e.g. `auth.api.getSession({ headers })` on the server). Store
 * `orgId` on the user/session and enforce org membership at the middleware
 * layer. Until then `requireOrgId()` falls back to the first seeded org so
 * existing flows keep working without a login wall.
 */

export type Session = {
  userId: string | null;
  orgId: number | null;
  email?: string | null;
  // TODO(Better Auth): extend with role, membership, etc.
};

/**
 * Stub session resolver.
 *
 * Returns `null` in demo mode so callers can distinguish "no authenticated
 * session" from an actual session object. Future implementations should:
 *  - read cookies/headers via `next/headers`
 *  - delegate to Better Auth and return `{ userId, orgId, ... }`
 *  - never throw for anonymous requests — let `requireOrgId()` decide
 */
export async function getSession(): Promise<Session | null> {
  // TODO(Better Auth): implement real session retrieval
  // Example (pseudo):
  //   const session = await auth.api.getSession({ headers: await headers() });
  //   if (!session?.user) return null;
  //   const membership = await db.query.members.findFirst({ where: eq(members.userId, session.user.id) });
  //   return { userId: session.user.id, orgId: membership?.orgId ?? null, email: session.user.email };
  return null;
}

/**
 * Resolve the active organisation id for the current request.
 *
 * In production this MUST derive from the authenticated session's
 * organisation membership. For now we return the first org so the demo
 * dataset remains usable without login.
 *
 * Throws only when no organisation exists at all (empty database).
 */
export async function requireOrgId(): Promise<number> {
  const session = await getSession();

  if (session?.orgId) {
    return session.orgId;
  }

  // TODO(Better Auth): remove fallback once every request carries a session
  // with an orgId. This fallback keeps `agent.ts` and reports functional in
  // demo mode and during seeding before any user has signed in.
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(organizations.id)
    .limit(1);

  if (!org) {
    throw new Error("No organization is configured — did seeding fail?");
  }

  return org.id;
}
