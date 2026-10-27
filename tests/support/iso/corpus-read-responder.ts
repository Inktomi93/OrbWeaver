import type { UserId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { readCorpusCapture } from "./corpus-playback.ts";
import type { CorpusCapture, CorpusPlaybackRead, CorpusPlaybackViewerRead, CorpusProcedurePath, CorpusRead } from "./corpus-read.ts";

function captureKey<T>(value: T): string | undefined {
  // The canonical JSON stringifier collapses undefined into null; request input presence must survive.
  return value === undefined ? undefined : stableStringify(value);
}

/** Bind one explicitly selected snapshot to its captured viewer; this selects fixture data, not authentication. */
export function createCorpusViewerReadResponder<P extends CorpusProcedurePath>(
  path: P,
  viewerUserId: UserId,
  snapshot: CorpusPlaybackViewerRead<NoInfer<P>>,
): (input: CorpusRead<P>["input"]) => CorpusRead<P>["output"] {
  if (snapshot.viewerUserId !== viewerUserId) {
    throw new Error(`Corpus snapshot viewer does not match ${path}`);
  }
  return createCorpusReadResponder(path, viewerUserId, [snapshot.read]);
}

/** Selects captured reads by exact input; conflicting or missing captures refuse instead of inventing data. */
export function createCorpusReadResponder<P extends CorpusProcedurePath>(
  path: P,
  viewerUserId: UserId,
  records: readonly CorpusPlaybackRead<NoInfer<P>>[],
): (input: CorpusRead<P>["input"]) => CorpusRead<P>["output"] {
  const captures = new Map<string | undefined, CorpusCapture<CorpusRead<P>["input"], CorpusRead<P>["output"]>>();
  for (const capture of records) {
    const record = readCorpusCapture(path, viewerUserId, capture);
    const key = captureKey(record.input);
    const previous = captures.get(key);
    if (previous !== undefined && captureKey(previous.output) !== captureKey(record.output)) {
      throw new Error(`Conflicting corpus captures for ${path}`);
    }
    captures.set(key, record);
  }
  return (input) => {
    const key = captureKey(input);
    const record = captures.get(key);
    if (record === undefined) {
      throw new Error(`Uncaptured corpus read for ${path}`);
    }
    return record.output;
  };
}
