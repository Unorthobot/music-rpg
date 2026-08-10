import type { IconName } from "@/lib/navigation";

/**
 * Icon set.
 *
 * Line icons drawn on a 24-grid — deliberately plain, because the personality
 * of this product lives in typography and space, not in decorated glyphs.
 * Icons are always paired with a text label; none of them carry meaning alone.
 */
const paths: Record<IconName, string> = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  world: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  studio: "M12 3v10.6M12 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3l6 2.4M12 6.6l6 2.4",
  career: "M4 20V9m5 11V4m5 16v-7m5 7V7",
  crew: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3 20c0-3 2.7-5.2 6-5.2S15 17 15 20M16.5 11.4a2.8 2.8 0 1 0 0-5.6M17.5 14.4c2 .7 3.5 2.6 3.5 5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  messages: "M4 5h16v11H9l-5 4z",
  notifications: "M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6zM10 19a2 2 0 0 0 4 0",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.8-5.6 7.5-5.6s6.7 2 7.5 5.6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.7 7.7 0 0 0-2.6-1.5L14.4 3h-3.6l-.3 2.4a7.7 7.7 0 0 0-2.6 1.5l-2-.8L4 9.2l1.7 1.3a7.6 7.6 0 0 0 0 3L4 14.8l1.8 3.1 2-.8a7.7 7.7 0 0 0 2.6 1.5l.3 2.4h3.6l.3-2.4a7.7 7.7 0 0 0 2.6-1.5l2 .8 1.8-3.1z",
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
