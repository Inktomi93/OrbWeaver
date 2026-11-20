// domain/assets/substrate/cap — the store's byte cap, the one comparison the store and its read-only admission twin
// both ask, so a dry run and a write refuse the same blob.

/** Whether `bytes` is over the caller's cap. No cap (`undefined`) admits any size. */
export function exceedsAssetCap(bytes: Uint8Array, maxBytes: number | undefined): boolean {
  return maxBytes !== undefined && bytes.byteLength > maxBytes;
}
