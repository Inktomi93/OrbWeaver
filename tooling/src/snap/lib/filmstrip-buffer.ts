// Filmstrip retention is pixel-byte bounded; action brackets outrank intermediate sampling inside those bounds.
import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";
import type { FilmstripActionMarker, FilmstripCaptureReceipt, FilmstripFrame, FilmstripLimits } from "../contract/filmstrip.ts";

interface RetainedAction extends FilmstripActionMarker {
  readonly beforeSequence: number | null;
  atSequence: number | null;
  afterSequence: number | null;
  sawPostFrame: boolean;
}

export class FilmstripBuffer {
  readonly #limits: FilmstripLimits;
  readonly #startedAt: number;
  readonly #frames: FilmstripFrame[] = [];
  readonly #actions: RetainedAction[] = [];
  #observedFrames = 0;
  #observedBytes = 0;
  #retainedBytes = 0;
  #acked = 0;
  #durationLimitEvents = 0;

  constructor(limits: FilmstripLimits, startedAt: number) {
    this.#limits = limits;
    this.#startedAt = startedAt;
  }

  mark(index: number, label: string, now: number): void {
    const beforeSequence = this.#observedFrames === 0 ? null : this.#observedFrames - 1;
    this.#actions.push({
      index,
      label,
      elapsedMs: Math.max(0, now - this.#startedAt),
      beforeSequence,
      atSequence: beforeSequence,
      afterSequence: beforeSequence,
      sawPostFrame: false,
    });
  }

  acknowledge(): void {
    this.#acked += 1;
  }

  limitDuration(): void {
    this.#durationLimitEvents += 1;
  }

  push(bytes: Buffer, now: number): void {
    const elapsedMs = Math.max(0, now - this.#startedAt);
    const sequence = this.#observedFrames;
    this.#observedFrames += 1;
    this.#observedBytes += bytes.byteLength;
    const withinDuration = elapsedMs <= this.#limits.durationMs;
    if (!withinDuration) {
      this.#durationLimitEvents += 1;
      return;
    }
    const label = this.#actions.findLast((marker) => marker.elapsedMs <= elapsedMs)?.label ?? "before actions";
    this.#frames.push({ sequence, elapsedMs, label, bytes });
    this.#retainedBytes += bytes.byteLength;
    const action = this.#actions.at(-1);
    if (action !== undefined && elapsedMs >= action.elapsedMs) {
      if (!action.sawPostFrame) {
        action.atSequence = sequence;
        action.sawPostFrame = true;
      }
      action.afterSequence = sequence;
    }
    this.#prune();
  }

  #requiredSequences(): ReadonlySet<number> {
    const required = new Set<number>();
    if (this.#observedFrames > 0) {
      required.add(0);
      required.add(this.#observedFrames - 1);
    }
    for (const action of this.#actions) {
      for (const sequence of [action.beforeSequence, action.atSequence, action.afterSequence]) {
        if (sequence !== null) {
          required.add(sequence);
        }
      }
    }
    return required;
  }

  #prune(): void {
    while (this.#frames.length > this.#limits.frames || this.#retainedBytes > this.#limits.bytes) {
      const required = this.#requiredSequences();
      let removeAt = this.#frames.findIndex((frame) => !required.has(frame.sequence));
      if (removeAt === -1) {
        const latestSequence = this.#observedFrames - 1;
        removeAt = this.#frames.findIndex((frame) => frame.sequence !== 0 && frame.sequence !== latestSequence);
      }
      if (removeAt === -1) {
        removeAt = this.#frames[0]?.sequence === 0 && this.#frames.length > 1 ? 0 : this.#frames.length - 1;
      }
      const [removed] = this.#frames.splice(removeAt, 1);
      if (removed !== undefined) {
        this.#retainedBytes -= removed.bytes.byteLength;
      }
    }
  }

  #actionFrameEvents(): InstrumentArtifactLimitReceipt["events"] {
    const retained = new Set(this.#frames.map((frame) => frame.sequence));
    return this.#actions.flatMap((action, actionIndex) =>
      (
        [
          ["before", action.beforeSequence],
          ["at", action.atSequence],
          ["after", action.afterSequence],
        ] as const
      ).flatMap(([position, sequence]) =>
        sequence !== null && retained.has(sequence)
          ? []
          : [{ kind: "action-frame-missing", path: `$.actions[${String(actionIndex)}].${position}`, original: 1, retained: 0, omitted: 1 }],
      ),
    );
  }

  receipt(now: number): FilmstripCaptureReceipt {
    const frameOmitted = this.#observedFrames - this.#frames.length;
    const byteOmitted = this.#observedBytes - this.#retainedBytes;
    const events: InstrumentArtifactLimitReceipt["events"] = [
      ...(frameOmitted === 0
        ? []
        : [{ kind: "frame-cap", path: "$.frames", original: this.#observedFrames, retained: this.#frames.length, omitted: frameOmitted }]),
      ...(byteOmitted === 0
        ? []
        : [{ kind: "byte-cap", path: "$.frames[].bytes", original: this.#observedBytes, retained: this.#retainedBytes, omitted: byteOmitted }]),
      ...(this.#durationLimitEvents > 0
        ? [{ kind: "duration-cap", path: "$.durationMs", original: Math.max(0, now - this.#startedAt), retained: this.#limits.durationMs, omitted: null }]
        : []),
      ...this.#actionFrameEvents(),
    ];
    return {
      frames: [...this.#frames],
      actions: this.#actions.map(({ index, elapsedMs, label }) => ({ index, elapsedMs, label })),
      observedFrames: this.#observedFrames,
      observedBytes: this.#observedBytes,
      retainedBytes: this.#retainedBytes,
      durationMs: Math.max(0, now - this.#startedAt),
      durationLimited: this.#durationLimitEvents > 0,
      acked: this.#acked,
      limits: [
        {
          source: "filmstrip-pixel-retention",
          complete: events.length === 0,
          policy: { frames: this.#limits.frames, bytes: this.#limits.bytes, durationMs: this.#limits.durationMs },
          events,
        },
      ],
    };
  }
}
