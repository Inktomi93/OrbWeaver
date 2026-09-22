// The structured-turn contract (D79): what `runStructuredTurn` takes, what its bounded retry reports, and the
// error it throws when both attempts fail. The caller owns the payload schema, the prompt, the recovery policy
// and the tracing; this package owns only the mechanics.

import type { z } from "zod";

/** Thrown when BOTH the first turn and the one bounded retry fail extraction/validation. Carries the last
 *  zod issue summary + the raw reply so the caller's policy surface can log/inspect. */
export class StructuredOutputError extends Error {
  readonly issues: string;
  readonly raw: string;
  constructor(issues: string, raw: string) {
    super(`structured output failed validation after one retry: ${issues}`);
    this.name = "StructuredOutputError";
    this.issues = issues;
    this.raw = raw;
  }
}

/**
 * What the bounded retry reports to the caller's observability seam.
 *
 * METADATA ONLY, deliberately: the zod MESSAGES are absent because they quote the model's own output
 * ("…received 'Ambrose the Grey'"), i.e. RP content, which must never reach a span attribute or a log field.
 * The schema PATHS are ours — they name the contract, not the story — and a count plus the failing paths is
 * what actually answers "which field does this model keep getting wrong".
 */
export interface StructuredRetrySummary {
  readonly issueCount: number;
  /** The failing schema paths in issue order; a root-level issue contributes `""`. */
  readonly paths: readonly string[];
}

export interface StructuredTurnArgs<T> {
  /** The caller's runtime validator — also the meaning of the payload (the caller owns it). */
  readonly payloadSchema: z.ZodType<T>;
  /** Runs one turn against the caller's wire request (which already carries the `ResponseFormat`). On the
   *  retry, `correction` is the zod issue summary — the caller's closure appends it to its prompt. */
  readonly run: (correction?: string) => Promise<string>;
  /**
   * Called EXACTLY ONCE, immediately before the bounded second attempt runs — never on a first-try success
   * and never on the final failure (that one is the thrown {@link StructuredOutputError}, which the caller
   * already sees).
   *
   * INJECTED because the span belongs to the caller: this package cannot reach the server's observability, so
   * without this seam a lane that silently costs two provider calls looks identical to one that costs one.
   *
   * It must not throw and must not be async — it annotates, it does not participate.
   */
  readonly onRetry?: ((summary: StructuredRetrySummary) => void) | undefined;
}
