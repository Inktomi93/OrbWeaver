// Reading visibility and model-wire policy are independent (D285).
// Member authorization is separate: the server removes hidden bodies before member delivery.

import type { ContentSpanKind } from "@orb/kit/content";

/** A content class's reading visibility and baseline model-wire projection. */
export interface ContentClassPolicy {
  readonly reading: "show" | "hide";
  readonly wire: "full" | "stub" | "drop";
}

/**
 * Canonical policy consumed by the reading projection.
 *
 * @remarks
 * Wire policy changes also require the per-kind handlers in server `chat/substrate/wire-history.ts`
 * and behavior tests against actual provider input. That projection preserves hidden and unknown-directive
 * bytes, drops choices, and stubs cards subject to the configured retention window. Owned attachments
 * resolve or degrade according to media capability; other images become display-only text markers.
 * A reading policy change never grants access to hidden bodies or changes model input.
 */
export const CONTENT_CLASS_POLICY: Readonly<Record<ContentSpanKind, ContentClassPolicy>> = {
  text: { reading: "show", wire: "full" },
  dice: { reading: "show", wire: "full" },
  image: { reading: "show", wire: "drop" },
  hidden: { reading: "hide", wire: "full" },
  card: { reading: "show", wire: "stub" },
  choices: { reading: "show", wire: "drop" },
  "unknown-directive": { reading: "hide", wire: "full" },
};
