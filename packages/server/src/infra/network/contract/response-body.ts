/** One native response body, held through reads or actual cancellation rather than its header arrival. */
export interface OwnedResponseBody {
  readonly response: Response;
  readonly settled: Promise<void>;
  readonly cancel: (reason?: unknown) => Promise<void>;
}
