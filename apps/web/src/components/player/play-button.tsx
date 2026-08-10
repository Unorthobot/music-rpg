"use client";

import { Button } from "@music-rpg/ui";
import { usePlayer, type PlayableTrack } from "./player-provider";

/**
 * Starting playback from anywhere.
 *
 * The button knows nothing about audio; it hands a track to the provider above
 * the routes, which is what lets the player keep going after you navigate away.
 */
export function PlayButton({
  track,
  variant = "primary",
}: {
  track: PlayableTrack;
  variant?: "primary" | "secondary";
}) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;

  return (
    <Button
      variant={variant}
      onClick={() => (isCurrent ? toggle() : play(track))}
      aria-pressed={isCurrent && playing}
    >
      {isCurrent && playing ? "Pause" : isCurrent ? "Resume" : "Play"}
    </Button>
  );
}
