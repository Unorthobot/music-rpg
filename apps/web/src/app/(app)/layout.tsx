import type { ReactNode } from "react";
import { PlayerProvider } from "@/components/player/player-provider";

/**
 * The in-app layout.
 *
 * Its only job is to be the thing that does *not* remount when the player
 * navigates. Playback state and the media element hang off this boundary, so
 * moving from Home to Career to the Studio never interrupts a track.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>;
}
