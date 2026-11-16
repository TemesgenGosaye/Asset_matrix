import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const microsoftEnabled = !!(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
  const googleEnabled = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  // Only a genuinely valid session should leave the login page. The proxy can
  // only see that a cookie exists, not whether it is still valid; validating
  // here is what stops a stale cookie from looping /login -> /dashboard ->
  // /login forever.
  let session = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    // A stale/invalid session is treated as signed out.
  }

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <LoginForm
      microsoftEnabled={microsoftEnabled}
      googleEnabled={googleEnabled}
    />
  );
}
