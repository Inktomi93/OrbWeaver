export interface RetrievalFallback<T> {
  readonly empty: T;
  readonly onIndexUnavailable: (() => void) | undefined;
}
