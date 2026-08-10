import Link from "next/link";
import { brand } from "@music-rpg/shared";
import { Label, LinkButton } from "@music-rpg/ui";
import { getCurrentUser } from "@/lib/session";

/**
 * Landing.
 *
 * The opening of a game, not a marketing page: three acts, one promise, one
 * door. Every product name on screen comes from the brand configuration.
 */
const acts = [
  {
    numeral: "I",
    name: "The Underground",
    line: "Get noticed. Nobody is looking yet, and that is the whole problem.",
  },
  {
    numeral: "II",
    name: "The Come Up",
    line: "Turn attention into a career before the attention moves on.",
  },
  {
    numeral: "III",
    name: "The Industry",
    line: "Decide what to do with influence, and who it costs.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="flex items-center justify-between px-gutter py-5">
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-8 w-8 rounded-sm bg-ember/90 flex items-center justify-center text-[#1a0a05] font-bold text-sm"
          >
            {brand.shortName.slice(0, 1)}
          </span>
          <span className="text-sm font-semibold">{brand.productName}</span>
        </span>

        {user ? (
          <Link href="/start" className="text-sm text-ink-muted hover:text-ink">
            Continue
          </Link>
        ) : (
          <Link href="/login" className="text-sm text-ink-muted hover:text-ink">
            Sign in
          </Link>
        )}
      </header>

      <main id="main" className="flex-1 px-gutter">
        <section className="mx-auto w-full max-w-[880px] pt-10 pb-16 md:pt-20 flex flex-col gap-6 animate-rise-in">
          <Label>A persistent music-career simulation</Label>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-display text-balance max-w-[18ch]">
            {brand.tagline}
          </h1>
          <p className="text-lg text-ink-muted max-w-[58ch]">
            Create an artist or a group, find a sound that belongs to you, and live a career that
            keeps running whether it goes well or badly. Nothing here resets.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <LinkButton href={user ? "/start" : "/register"} size="lg">
              {user ? "Continue your career" : "Start your career"}
            </LinkButton>
            {!user ? (
              <LinkButton href="/login" size="lg" variant="secondary">
                I already have an account
              </LinkButton>
            ) : null}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[880px] pb-20">
          <Label>Three acts, one career</Label>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {acts.map((act) => (
              <li
                key={act.numeral}
                className="rounded-lg border border-line-subtle bg-surface-1 p-5 flex flex-col gap-2"
              >
                <span className="text-xs text-ember tracking-label uppercase">Act {act.numeral}</span>
                <span className="text-lg font-semibold tracking-display">{act.name}</span>
                <p className="text-sm text-ink-muted">{act.line}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-subtle">
            Past Act III there is Legacy — an ongoing state, not an ending.
          </p>
        </section>
      </main>

      <footer className="px-gutter py-6 text-xs text-ink-subtle border-t border-line-subtle">
        {brand.productName} — development build. Worlds, artists and events are fictional.
      </footer>
    </div>
  );
}
