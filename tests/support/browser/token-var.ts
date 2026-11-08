import type { ToneRole } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";

/** A token as the `var()` reference a story's inline style paints with. */
export function cssVar(token: keyof typeof TOKENS): string {
  return `var(${TOKENS[token].cssVar})`;
}

/** A tone role's generated variable as a `var()` reference: it resolves to that role of the nearest `[data-tone]`. */
export function roleVar(role: ToneRole): string {
  return cssVar(`color.tone-${role}`);
}
