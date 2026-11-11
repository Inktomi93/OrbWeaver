// The one place an `EmbedFailedError` is made: every store, the segment batch and the width probe. Its message is
// client-safe, so the lens and the model are logged here, once, where the failure is first seen; a catcher of the
// error does not log it again.

import { getLog } from "#foundation/observability";
import { EmbedFailedError } from "../contract/errors.ts";
import type { EmbeddingsContext } from "../contract/service.ts";

/** Log an input that could not be embedded (no vector, or no embed target to ask) and return the error to throw. */
export function embedFailure(ctx: Pick<EmbeddingsContext, "logger">, lens: string, model: string): EmbedFailedError {
  getLog(ctx.logger).warn({ lens, model }, "embeddings: an input could not be embedded; nothing is stored");
  return new EmbedFailedError(lens, model);
}
