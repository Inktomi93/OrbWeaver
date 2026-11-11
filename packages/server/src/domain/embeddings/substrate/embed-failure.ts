// The one place a producer failure becomes `EmbedFailedError`. Its message is client-safe, so the lens and the
// model that the old message carried are logged here, once, where the failure is first seen.

import { getLog } from "#foundation/observability";
import { EmbedFailedError } from "../contract/errors.ts";
import type { EmbeddingsContext } from "../contract/service.ts";

/** Log an input that could not be embedded (no vector, or no embed target to ask) and return the error to throw. */
export function embedFailure(ctx: EmbeddingsContext, lens: string, model: string): EmbedFailedError {
  getLog(ctx.logger).warn({ lens, model }, "embeddings: an input could not be embedded; nothing is stored");
  return new EmbedFailedError(lens, model);
}
