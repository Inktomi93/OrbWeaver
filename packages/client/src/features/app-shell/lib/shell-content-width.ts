import { TOKENS } from "@orb/ui/tokens";

/** The `--width-shell-content` expression: the reader's chat-width percentage, clamped between the token floor
 *  and the viewport. The shell stamps it and the room-track CT stage carries it, so both read one spelling. */
export function shellContentWidth(chatWidthPct: number): string {
  return `clamp(var(${TOKENS["dimension.shell-content-floor"].cssVar}), ${chatWidthPct}dvw, 100dvw)`;
}
