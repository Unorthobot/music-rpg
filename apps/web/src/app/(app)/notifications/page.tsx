import { UtilityPage } from "../utility-page";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <UtilityPage
      title="Notifications"
      eyebrow="Notifications"
      emptyTitle="Nothing has happened while you were gone."
      description="Once the world simulation runs between sessions, this is where you find out what changed — good and bad."
    />
  );
}
