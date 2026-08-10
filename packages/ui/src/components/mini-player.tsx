"use client";

import { cn } from "../cn";
import { Label } from "../primitives";

/**
 * MusicMiniPlayer.
 *
 * Persistent at the bottom of the app: a full bar on desktop, a compact strip
 * above the bottom navigation on mobile. Nothing can play until the Studio
 * milestone produces a catalogue, so the idle state says exactly that instead
 * of miming a transport that does nothing.
 */
export type MusicMiniPlayerProps = {
  track?: { title: string; artistName: string } | null;
  playing?: boolean;
  onTogglePlay?: () => void;
  className?: string;
};

function TransportButton({
  label,
  disabled,
  onClick,
  primary,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-pill transition-colors duration-fast",
        "h-11 w-11 disabled:opacity-30 disabled:cursor-not-allowed",
        primary ? "bg-surface-3 text-ink hover:bg-surface-raised" : "text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function MusicMiniPlayer({
  track = null,
  playing = false,
  onTogglePlay,
  className,
}: MusicMiniPlayerProps) {
  const idle = !track;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-line-subtle bg-surface-1/95 backdrop-blur px-gutter",
        "h-mobile-player md:h-player",
        className,
      )}
      aria-label="Music player"
    >
      <span
        aria-hidden
        className="hidden md:block h-10 w-10 shrink-0 rounded-sm border border-line-subtle bg-surface-3"
      />

      <div className="flex flex-col min-w-0 flex-1">
        {idle ? (
          <>
            <Label>Player</Label>
            <span className="text-xs md:text-sm text-ink-subtle truncate">
              Nothing playing yet — your catalogue starts in the Studio.
            </span>
          </>
        ) : (
          <>
            <span className="text-sm text-ink truncate">{track.title}</span>
            <span className="text-xs text-ink-subtle truncate">{track.artistName}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <TransportButton label="Previous track" disabled>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M4 2h2v12H4zM13 2v12L6 8z" />
          </svg>
        </TransportButton>
        <TransportButton
          label={playing ? "Pause" : "Play"}
          disabled={idle}
          onClick={onTogglePlay}
          primary
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 2h3v12H4zM9 2h3v12H9z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 2l10 6-10 6z" />
            </svg>
          )}
        </TransportButton>
        <TransportButton label="Next track" disabled>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M10 2h2v12h-2zM3 2l7 6-7 6z" />
          </svg>
        </TransportButton>
      </div>
    </div>
  );
}
