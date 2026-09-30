// A model id is PROVIDER-OWNED foreign identity, not an Orbweaver entity id and not a closed vocabulary.
// Catalog rows are an open discovery aid: endpoint connections deliberately support a typed fallback when
// discovery fails or returns no rows. The trust-boundary invariant is therefore exactly normalized,
// non-empty text, branded only after this parser succeeds. Membership in a catalog is evidence
// (`user_connections.model_check`), never validity; inventing a closed model registry would reject the
// supported fallback and every model a plugin or endpoint learns after startup.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { z } from "zod";

/** Parse a provider-owned model id: trim transport/import whitespace, refuse empty, then apply the brand. */
export const modelIdSchema: z.ZodType<ModelId, string> = z
  .string()
  .trim()
  .min(1)
  .transform((value): ModelId => castId<ModelId>(value));

// huggingface_hub's repo-id rule with the owner segment required: each segment starts and ends with a word
// character, so no segment is empty, `.` or `..`, and no id is absolute, drive-lettered or a URL.
const HUB_MODEL_ID = /^\w(?:[\w.-]*\w)?\/\w(?:[\w.-]{0,94}\w)?$/;

/**
 * Whether a model id is a Hugging Face Hub repo id (`owner/repo`), the only shape the in-process loader may see.
 *
 * @remarks
 * SECURITY: transformers.js resolves every other id as a filesystem path: it reads `<id>/config.json` beside its
 * file cache (a `../` id escapes that directory) and, with local models on, relative to the process. The rest of
 * the rule matches the library's own `isValidHfModelId`, so every id admitted here is one the library treats as a
 * Hub repo rather than a path. Do not loosen it to admit a bare `repo` or a path for a local model.
 */
export function isHubModelId(id: string): boolean {
  return HUB_MODEL_ID.test(id) && !id.includes("..") && !id.includes("--") && !id.endsWith(".git") && !id.endsWith(".ipynb");
}
