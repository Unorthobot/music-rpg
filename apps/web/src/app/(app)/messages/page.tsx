import { UtilityPage } from "../utility-page";

export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <UtilityPage
      title="Messages"
      eyebrow="Messages"
      emptyTitle="No one has reached out."
      description="Managers, promoters, producers and rivals start messaging you when they have a reason to. Right now, nobody knows you exist."
    />
  );
}
