"use client";

import { MusicMiniPlayer } from "@music-rpg/ui";
import { usePlayer } from "@/components/player/player-provider";

/**
 * The player bar is a view.
 *
 * It remounts with each page; the playback it reflects does not, because that
 * lives in the provider above the routes.
 */
export function PlayerBar() {
  const { current, playing, toggle } = usePlayer();

  return (
    <MusicMiniPlayer
      track={current ? { title: current.title, artistName: current.artistName } : null}
      playing={playing}
      onTogglePlay={toggle}
    />
  );
}
