"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Playback, above the routes.
 *
 * This provider is mounted by the `(app)` layout, which Next preserves across
 * navigation inside the group — so the state *and* the media element survive
 * moving between Home, Career, Studio and the World. Nothing about playback
 * lives in a page; pages only ever call into this.
 *
 * The `<audio>` element is rendered here for the same reason: mounting it in a
 * page would tear the stream down on every route change. While the development
 * provider produces structured work rather than audio, `src` is null and the
 * element is inert — the model behaves like the real one, and swapping in a
 * real asset later changes nothing above this file.
 */
export type PlayableTrack = {
  id: string;
  title: string;
  artistName: string;
  /** Null while a track has no rendered audio. The queue still works. */
  audioUrl: string | null;
  /** Shown instead of a waveform when there is no audio yet. */
  developmentPreview: boolean;
};

type PlayerState = {
  current: PlayableTrack | null;
  playing: boolean;
  play: (track: PlayableTrack) => void;
  toggle: () => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((track: PlayableTrack) => {
    setCurrent(track);
    setPlaying(true);

    const element = audioRef.current;
    if (element && track.audioUrl) {
      element.src = track.audioUrl;
      void element.play().catch(() => setPlaying(false));
    }
  }, []);

  const toggle = useCallback(() => {
    setPlaying((value) => {
      const next = !value;
      const element = audioRef.current;

      if (element && element.src) {
        if (next) void element.play().catch(() => undefined);
        else element.pause();
      }

      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    setCurrent(null);
    audioRef.current?.pause();
  }, []);

  const value = useMemo(
    () => ({ current, playing, play, toggle, stop }),
    [current, playing, play, toggle, stop],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Lives with the provider, not with any page. */}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} hidden />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used inside the app shell");
  }
  return context;
}
