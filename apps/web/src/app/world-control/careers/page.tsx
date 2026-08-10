import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { careers, users } from "@music-rpg/database";
import { Label } from "@music-rpg/ui";
import { getAppDb } from "@/lib/db";

/** Every career with the account behind it. Internal surface only. */
export default async function WorldControlCareers() {
  const db = await getAppDb();

  const rows = await db
    .select({ career: careers, user: users })
    .from(careers)
    .innerJoin(users, eq(users.id, careers.userId))
    .orderBy(desc(careers.createdAt))
    .limit(100);

  return (
    <section className="flex flex-col gap-3">
      <Label>Careers ({rows.length})</Label>

      <div className="overflow-x-auto rounded-md border border-line-subtle">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-surface-2 text-ink-subtle text-xs uppercase tracking-label">
            <tr>
              <th className="text-left font-medium px-4 py-3">Career</th>
              <th className="text-left font-medium px-4 py-3">Account</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Act</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3">Controls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ career, user }) => (
              <tr key={career.id} className="border-t border-line-subtle">
                <td className="px-4 py-3">
                  <Link href={`/world-control/careers/${career.id}`} className="text-ember">
                    {career.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-muted">{user.email}</td>
                <td className="px-4 py-3 text-ink-muted">{career.careerType ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{career.careerAct}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {career.status} · {career.onboardingState}
                </td>
                <td className="px-4 py-3 text-ink-subtle font-mono text-xs">
                  {career.controlledEntityType ?? "—"} {career.controlledEntityId ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
