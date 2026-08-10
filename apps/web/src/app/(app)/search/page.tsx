import { UtilityPage } from "../utility-page";

export const metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <UtilityPage
      title="Search"
      eyebrow="Search"
      emptyTitle="Nothing to find yet."
      description="Artists, groups, scenes and venues become searchable once the world starts moving. Your own identity is already searchable to you — it's on the Career screen."
    />
  );
}
