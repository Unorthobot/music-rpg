"use client";

import { useState } from "react";
import { MusicMiniPlayer } from "@music-rpg/ui";

/**
 * The persistent player.
 *
 * State lives here so the shell stays a server component. There is no catalogue
 * yet, so the player holds its idle state honestly rather than pretending to
 * have a queue.
 */
export function PlayerBar() {
  const [playing, setPlaying] = useState(false);

  return (
    <MusicMiniPlayer
      track={null}
      playing={playing}
      onTogglePlay={() => setPlaying((value) => !value)}
    />
  );
}
