// A model id is PROVIDER-OWNED foreign identity, not an Orbweaver entity id and not a closed vocabulary.
// Catalog rows are an open discovery aid: endpoint connections deliberately support a typed fallback when
// discovery fails or returns no rows. The trust-boundary invariant is therefore exactly normalized,
// non-empty text, branded only after this parser succeeds. Membership in a catalog is evidence
// (`user_connections.model_listed`), never validity; inventing a closed model registry would reject the
// supported fallback and every model a plugin or endpoint learns after startup.

import type { ModelId } from "@orb/kit/ids";
import { z } from "zod";

/** Parse a provider-owned model id: trim transport/import whitespace, refuse empty, then apply the brand. */
export const modelIdSchema: z.ZodType<ModelId, string> = z.string().trim().min(1) as unknown as z.ZodType<ModelId, string>;
