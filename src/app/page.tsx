import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The root route is a redirect, not a page.
 *
 * WHY THERE IS NO LANDING PAGE
 * This is a single-tenant internal portal, not a SaaS marketing site. The old
 * landing page described a product ("Trusted by teams worldwide", "500+
 * Organizations", "Join hundreds of organizations already using Asset Tracker")
 * that this deployment does not have and is not trying to have — it is one
 * factory's asset and house register. Anything an employee or a counter officer
 * needs is behind the login, so the first thing `/` should do is ask them to log
 * in rather than sell them something.
 *
 * It also used to be conditional on `SELF_HOSTED`, which meant the same build
 * served a public marketing page or a login screen depending on an env var, and
 * the marketing page was the default. Making the redirect unconditional removes
 * that branch and the flag it depended on.
 *
 * WHY THE SESSION CHECK IS STILL HERE
 * A signed-in user who bookmarks `/` should land on their dashboard, not be
 * bounced out to a login form they do not need. `src/proxy.ts` does the same
 * thing one layer earlier for `/login` itself, so the two cover both directions:
 * `/` sends a session to `/dashboard`, and `/login` sends a session onward too.
 * Without the check, a signed-in user would see the login page every time they
 * opened the app from the home icon.
 *
 * WHY NO `metadata` EXPORT
 * This module exports no page, so it needs no title or description. The document
 * that actually renders is `/login`, which sets its own.
 */
export default async function Home() {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    // Ignore auth errors (e.g. stale JWT) — treat as unauthenticated and send
    // them to the login screen, which is where a stale session has to end up
    // anyway.
  }

  redirect(session?.user ? "/dashboard" : "/login");
}
