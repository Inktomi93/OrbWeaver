// The package intentionally publishes no declarations for its browser-free parser subpath. Snap's loader
// treats this only as an unknown runtime constructor and validates the exact method set before any parse.
declare module "chrome-devtools-mcp/build/src/processors/HeapSnapshotManager.js" {
  export const HeapSnapshotManager: new () => object;
}
