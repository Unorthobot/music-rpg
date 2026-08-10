import { brand } from "@music-rpg/shared";
import { Button, Label, StatDescriptor, Surface } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { isInternalUser } from "@/lib/session";
import { logoutAction } from "../../(auth)/actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, view } = await requireCareer();

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Settings"
      title="Settings"
    >
      <Surface level={1} padded="lg" className="py-2">
        <StatDescriptor name="Account" descriptor={user.displayName} detail={user.email} />
        <StatDescriptor name="World" descriptor={view.world.name} />
        <StatDescriptor name="Act" descriptor={ACT_LABELS[view.career.careerAct]} />
        <StatDescriptor name="Locale" descriptor={user.locale} detail={user.timezone} />
        <StatDescriptor name="Plan" descriptor={user.subscriptionTier} />
      </Surface>

      {isInternalUser(user) ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Internal</Label>
          <p className="text-sm text-ink-muted">
            You have access to World Control — the debug surface for worlds, careers and the
            canonical event log.
          </p>
          <a
            href="/world-control"
            className="text-sm text-ember underline underline-offset-4 min-h-[44px] inline-flex items-center"
          >
            Open World Control
          </a>
        </Surface>
      ) : null}

      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>Session</Label>
        <p className="text-sm text-ink-muted">
          Signing out leaves everything exactly where it is. {brand.productName} keeps your career
          on the server, not in this browser.
        </p>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </Surface>
    </AppShell>
  );
}
