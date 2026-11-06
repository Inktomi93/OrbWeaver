// Two classes compared by the merger that renders them, so a new token or utility family needs no table here.
import { cn } from "@orb/ui/lib";

const evicts = (winner: string, loser: string): boolean => !(cn(loser, winner) ?? "").split(" ").includes(loser);

const FAMILIES = new Map<string, boolean>();

/** Each class evicts the other: one utility family, such as `gap-row` and `gap-section`. */
export function sameFamily(left: string, right: string): boolean {
  const key = `${left} ${right}`;
  const known = FAMILIES.get(key);
  if (known !== undefined) {
    return known;
  }
  const family = left === right || (evicts(left, right) && evicts(right, left));
  FAMILIES.set(key, family);
  return family;
}

/** Either class, written last, evicts the other. */
export const conflicts = (left: string, right: string): boolean => evicts(left, right) || evicts(right, left);

/** The class survives when `winner` is written after it. */
export const survives = (written: string, winner: string): boolean => !evicts(winner, written);
