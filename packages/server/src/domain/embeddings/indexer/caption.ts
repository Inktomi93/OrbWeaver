// domain/embeddings/indexer/caption — the ONE avatar-caption generator for the `image-captioned` lens.
// Shared by the event handler (`onAssetCreated`) and the PD-53 bulk asset pass (`verbs/embed-assets.ts`) so
// the caption prompt/behavior can never drift between the on-write and catch-up paths. Homed in the indexer
// subsystem (the async/bulk path) because it calls the injected `summarize` role op — NOT `substrate/`
// (which stays pure compute).

import type { RoleClients } from "@orb/contracts/role-clients";

// The avatar caption prompt (image-captioned lens): the joint VL embed combines the image bytes with this
// generated caption. A constant (no magic strings) — the caption model is `roleClients.summarizerModel`.
const CAPTION_SYSTEM_PROMPT =
  "You are an image captioner. Describe the visible subject, style, and notable details in one concise sentence. No preamble.";
const CAPTION_USER_PROMPT = "Describe this image.";

/** Generate the avatar caption inline via the injected `summarize` op (decided: inline, not a chained
 *  `caption.created` event — the caption is fast enough; an extra event hop buys nothing). Returns the
 *  summary text, or "" when the family returned no item — the `store` verb treats an empty caption as
 *  skip-don't-write for the captioned lens (F8: it would otherwise poison the bytes-hashed row permanently),
 *  so the captioned embed is retried on the next indexer run; the raw lens carries the image-only signal. */
export async function generateAvatarCaption(
  roleClients: RoleClients,
  bytes: Uint8Array,
): Promise<string> {
  const result = await roleClients.summarize([
    { systemPrompt: CAPTION_SYSTEM_PROMPT, userPrompt: CAPTION_USER_PROMPT, images: [bytes] },
  ]);
  return result.items[0]?.text ?? "";
}
