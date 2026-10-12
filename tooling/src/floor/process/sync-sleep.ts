/** A synchronous pause. A path that cannot yield to an event loop (spawnSync boots, a held lock, a worker
 *  stand-in that blocks like a native run) waits here: `Atomics.wait` on a throwaway buffer is node's
 *  sanctioned sync sleep and burns no CPU, unlike a spin. */
export function waitSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}
