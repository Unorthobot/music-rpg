import clsx, { type ClassValue } from "clsx";

/** Single class-name helper so components compose predictably. */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
