/** Builds deliberately invalid input for a refusal test; never use it for a value the product could produce. */
export function forged<T>(value: unknown): T {
  return value as T;
}
