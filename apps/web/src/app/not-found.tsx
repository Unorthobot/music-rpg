import Link from "next/link";
import { EmptyState } from "@music-rpg/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-[720px] px-gutter py-16">
      <EmptyState
        eyebrow="404"
        title="Nothing here."
        description="This address doesn't point at anything in the world — yet."
        action={
          <Link href="/" className="text-sm text-ember underline underline-offset-4">
            Back to the start
          </Link>
        }
      />
    </main>
  );
}
