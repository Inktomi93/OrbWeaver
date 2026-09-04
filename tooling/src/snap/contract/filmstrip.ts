import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";

export interface FilmstripLimits {
  readonly frames: number;
  readonly bytes: number;
  readonly durationMs: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly quality: number;
}

export const FILMSTRIP_LIMITS = {
  frames: 48,
  bytes: 33_554_432,
  durationMs: 15_000,
  maxWidth: 640,
  maxHeight: 480,
  quality: 70,
} as const satisfies FilmstripLimits;

export interface FilmstripActionMarker {
  readonly index: number;
  readonly elapsedMs: number;
  readonly label: string;
}

export interface FilmstripFrame {
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly label: string;
  readonly bytes: Buffer;
}

export interface FilmstripCaptureReceipt {
  readonly frames: readonly FilmstripFrame[];
  readonly actions: readonly FilmstripActionMarker[];
  readonly observedFrames: number;
  readonly observedBytes: number;
  readonly retainedBytes: number;
  readonly durationMs: number;
  readonly durationLimited: boolean;
  readonly acked: number;
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}
