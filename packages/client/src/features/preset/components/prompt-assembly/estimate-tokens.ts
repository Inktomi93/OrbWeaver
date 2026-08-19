// Token-estimate seam for the Assembly rack + summary strip — pure, node-safe. The `~token` figure a
// section row displays is a UI hint only: the ONE `@orb/kit/tokens` estimator over the section's author
// text, never a server call or a macro resolution against live chat data.
//
// Comments (`{{// … }}`) are stripped before counting (`stripComments`, the ONE macro parser): a
// non-LLM-visible comment never reaches the assembled prompt, so it must never count toward the estimate
// either — the number the author sees matches what is actually sent (#302).

import type { MarkerType, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { stripComments } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";

/** A templated marker is exactly a key of `DEFAULT_MARKER_TEMPLATES` (an unset `template` is absent, so
 *  `"template" in section` is unreliable). */
function isTemplatedMarker(marker: MarkerType): marker is keyof typeof DEFAULT_MARKER_TEMPLATES {
  return marker in DEFAULT_MARKER_TEMPLATES;
}

/** The text a section contributes to the prompt, for estimation only — see the file header per-type map. */
function estimatableText(section: PromptSection): string {
  if (section.type === "literal") {
    return section.content;
  }
  if (!isTemplatedMarker(section.marker)) {
    return ""; // plain marker (chat_history / world_info_*) — no author text of its own.
  }
  // A templated marker: its custom `template` when set, else the factory default. `template` is an
  // optional field only the templated branch declares; read it via the section's own shape.
  const custom = "template" in section ? section.template : undefined;
  return custom ?? DEFAULT_MARKER_TEMPLATES[section.marker];
}

/** The `~token` estimate a rack row / strip shows for one section (chars/4 over its author text, with
 *  `{{// … }}` comments stripped — they cost zero tokens because they never reach the prompt). */
export function estimateSectionTokens(section: PromptSection): number {
  return estimateTokens(stripComments(estimatableText(section)));
}
