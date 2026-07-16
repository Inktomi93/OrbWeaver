// domain/embeddings/indexer/caption — the one avatar-caption generator for the image-captioned lens.
// Shared by onAssetCreated and the bulk asset pass so the caption prompt/behavior never drifts between
// the on-write and catch-up paths. Homed in indexer/ (calls the injected summarize role op), not substrate/.

import type { RoleClients } from "@orb/contracts/role-clients";

const CAPTION_SYSTEM_PROMPT = "You are an image captioner. Describe the visible subject, style, and notable details in one concise sentence. No preamble.";
const CAPTION_USER_PROMPT = "Describe this image.";

/** Returns "" when the family returned no item — the store verb treats an empty caption as skip-don't-write
 *  (else it would poison the bytes-hashed row permanently), retrying the captioned embed next run. */
export async function generateAvatarCaption(roleClients: RoleClients, bytes: Uint8Array): Promise<string> {
  const result = await roleClients.summarize([{ systemPrompt: CAPTION_SYSTEM_PROMPT, userPrompt: CAPTION_USER_PROMPT, images: [bytes] }]);
  return result.items[0]?.text ?? "";
}
