/**
 * Application destinations.
 *
 * Five primary destinations exist on every viewport; the infrastructure
 * surfaces (search, messages, notifications, calendar, profile, settings) exist
 * as real routes with intentional empty states rather than dead links.
 */
export type IconName =
  | "home"
  | "world"
  | "studio"
  | "career"
  | "crew"
  | "search"
  | "messages"
  | "notifications"
  | "calendar"
  | "profile"
  | "settings";

export type Destination = {
  href: string;
  label: string;
  icon: IconName;
  /** Short line used by the mobile "more" sheet and by empty states. */
  description: string;
};

export const primaryDestinations: Destination[] = [
  { href: "/home", label: "Home", icon: "home", description: "Where your career stands today." },
  { href: "/world", label: "World", icon: "world", description: "The scene around you." },
  { href: "/studio", label: "Studio", icon: "studio", description: "Where music gets made." },
  { href: "/career", label: "Career", icon: "career", description: "Identity, act and trajectory." },
  { href: "/crew", label: "Crew", icon: "crew", description: "The people you move with." },
];

export const utilityDestinations: Destination[] = [
  { href: "/search", label: "Search", icon: "search", description: "Find artists, groups and scenes." },
  { href: "/messages", label: "Messages", icon: "messages", description: "Conversations with the industry." },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "notifications",
    description: "What happened while you were gone.",
  },
  { href: "/calendar", label: "Calendar", icon: "calendar", description: "Sessions, shows and deadlines." },
  { href: "/profile", label: "Profile", icon: "profile", description: "Your public identity." },
  { href: "/settings", label: "Settings", icon: "settings", description: "Account and preferences." },
];

export const allDestinations = [...primaryDestinations, ...utilityDestinations];

export function destinationFor(pathname: string): Destination | undefined {
  return allDestinations.find(
    (destination) => pathname === destination.href || pathname.startsWith(`${destination.href}/`),
  );
}
