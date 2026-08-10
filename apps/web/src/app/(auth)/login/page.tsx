import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCareer, onboardingRoute } from "@music-rpg/domain";
import { Button, Field, Surface, TextInput } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AuthLayout } from "../auth-layout";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string };
}) {
  const user = await getCurrentUser();
  if (user) {
    const db = await getAppDb();
    redirect(onboardingRoute(await getActiveCareer(db, user.id)));
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in"
      intro="Your career kept running in your head. Everything else is exactly where you left it."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="text-ember underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <Surface level={1} padded="lg">
        <form action={loginAction} className="flex flex-col gap-5">
          {searchParams.error ? (
            <p role="alert" className="text-sm text-danger">
              {searchParams.error}
            </p>
          ) : null}

          <Field label="Email" htmlFor="email" required>
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={searchParams.email ?? ""}
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <Button type="submit" size="lg" fullWidth>
            Sign in
          </Button>
        </form>
      </Surface>
    </AuthLayout>
  );
}
