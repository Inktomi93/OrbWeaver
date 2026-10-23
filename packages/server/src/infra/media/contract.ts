import type { VideoMaxResolution } from "@orb/contracts/inference";

/** Per-call preparation limits and the caller-owned cancellation signal. */
export interface VideoPreparationOptions {
  readonly signal?: AbortSignal | undefined;
  readonly maxBytes?: number | undefined;
}

/** Resize an admitted stored video to MP4 bytes without touching its stored original. */
export type PrepareVideo = (bytes: Uint8Array, mime: string, resolution: VideoMaxResolution, options?: VideoPreparationOptions) => Promise<Uint8Array>;
