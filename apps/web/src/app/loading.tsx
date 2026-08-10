import { LoadingState } from "@music-rpg/ui";

export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-gutter py-16">
      <LoadingState label="Loading your career" />
    </div>
  );
}
