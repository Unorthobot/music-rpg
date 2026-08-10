import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Field, Surface, TextInput } from "@music-rpg/ui";
import { getCurrentUser } from "@/lib/session";
import { AuthLayout } from "../auth-layout";
import { registerAction } from "../actions";

export const metadata = { title: "Create your account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string; displayName?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect("/start");

  return (
    <AuthLayout
      eyebrow="Before anything else"
      title="Create your account"
      intro="This is you — the person. Your artist comes next, and they are not the same thing."
      footer={
        <>
          Already playing?{" "}
          <Link href="/login" className="text-ember underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <Surface level={1} padded="lg">
        <form action={registerAction} className="flex flex-col gap-5">
          {searchParams.error ? (
            <p role="alert" className="text-sm text-danger">
              {searchParams.error}
            </p>
          ) : null}

          <Field label="What should we call you?" htmlFor="displayName" required>
            <TextInput
              id="displayName"
              name="displayName"
              autoComplete="name"
              required
              defaultValue={searchParams.displayName ?? ""}
              placeholder="Your name"
            />
          </Field>

          <Field label="Email" htmlFor="email" required>
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={searchParams.email ?? ""}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" htmlFor="password" hint="At least 8 characters." required>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Button type="submit" size="lg" fullWidth>
            Create account
          </Button>
        </form>
      </Surface>
    </AuthLayout>
  );
}
