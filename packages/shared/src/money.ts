import { gameConfig } from "./config";
import { groupDigits, roundTo } from "./numbers";

/**
 * Money is stored as integer minor units everywhere in the simulation.
 * Formatting is the only place major units appear.
 */
export function formatMoney(
  minorUnits: number,
  options: { compact?: boolean } = {},
): string {
  const { symbol, minorUnitsPerMajor } = gameConfig.currency;
  const major = minorUnits / minorUnitsPerMajor;

  if (options.compact && Math.abs(major) >= 1000) {
    const thousands = major / 1000;
    const rounded = Math.abs(thousands) >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${symbol}${rounded}k`;
  }

  const rounded = major % 1 === 0 ? major : roundTo(major, 2);
  return `${symbol}${groupDigits(rounded)}`;
}

export function toMinorUnits(major: number): number {
  return Math.round(major * gameConfig.currency.minorUnitsPerMajor);
}
