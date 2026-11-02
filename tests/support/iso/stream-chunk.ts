/** Decodes one chunk read from a response body, whose reader types the chunk as `any`. */
export function decodeStreamChunk(decoder: { readonly decode: (input: Uint8Array, options: { readonly stream: boolean }) => string }, chunk: unknown): string {
  if (!(chunk instanceof Uint8Array)) {
    throw new Error("A response body chunk was not bytes");
  }
  return decoder.decode(chunk, { stream: true });
}
