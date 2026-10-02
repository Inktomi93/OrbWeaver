/** Per-call preparation limits and the caller-owned cancellation signal. */
export interface VideoPreparationOptions {
  readonly signal?: AbortSignal | undefined;
  readonly maxBytes?: number | undefined;
}
