// DRAFT-TRUST arm 1 — how the character EDITOR's own previews resolve render policy.
//
// Every other surface that renders card content reads a SERVER-resolved `renderPolicy` (the roster's
// `ParticipantView.renderPolicy`, built at compose by `resolveRenderPolicy(deploymentFloor, card)`). The
// editor has no roster: it renders the `characters` row it is editing, so it used to read the row's RAW
// override column (`trustHtml === true`) and call that the answer. That is not the same question — the
// override is one INPUT to the policy, and on a deployment whose floor trusts HTML an `inherit` card
// (`trustHtml: null`) resolves to TRUSTED at read time while the preview rendered it untrusted. A preview
// whose whole job is "show me what this will look like" must not answer a different question than the
// renderer does.
//
// So it runs the SAME contracts resolver over the deployment floor the server serves (`/api/auth/config`,
// `useRenderPolicyFloor`). No new round-trip and no second policy rule — one resolver, two callers.
// Fail-closed while the config is in flight (`SAFE_FLOOR`), never an optimistic guess.

import type { RenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import { resolveRenderPolicy } from "@orb/contracts/chat";
import { useRenderPolicyFloor } from "#data";

/** The render policy the editor's previews paint with — the deployment floor combined with THIS card's
 *  override, exactly as the server does it for committed content. */
export function usePreviewRenderPolicy(card: RenderPolicyOverride): RenderPolicy {
  return resolveRenderPolicy(useRenderPolicyFloor(), card);
}
