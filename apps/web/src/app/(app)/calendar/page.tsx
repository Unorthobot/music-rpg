import { UtilityPage } from "../utility-page";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <UtilityPage
      title="Calendar"
      eyebrow="Calendar"
      emptyTitle="Your calendar is empty."
      description="Sessions, shows, releases and deadlines land here as soon as there is anything to schedule. In-world time only moves when your career does."
    />
  );
}
