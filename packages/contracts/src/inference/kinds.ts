// The model KIND axis — what a model IS, which decides which capability schema describes it and which
// tasks a connection on it can serve. Three members, closed: `generation` (chat, summarize, structured,
// generateImage — image generation is a GENERATION model whose `output` modalities include `image`, never a
// fourth kind), `embedding` (embed, imageEmbed), `rerank`. One connection = one model = one kind.

import { z } from "zod";

export const MODEL_KINDS = ["generation", "embedding", "rerank"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];
export const modelKindSchema = z.enum(MODEL_KINDS);
