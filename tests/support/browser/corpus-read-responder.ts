import type { UserId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import type { CorpusRead, CorpusViewerRead } from "../iso/corpus.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "../node/route-trpc.ts";

function captureKey<T>(value: T): string | undefined {
  // The canonical JSON stringifier collapses undefined into null; request input presence must survive.
  return value === undefined ? undefined : stableStringify(value);
}

/** Bind one explicitly selected snapshot to its captured viewer; this selects fixture data, not authentication. */
export function createCorpusViewerReadResponder<P extends TrpcProcedurePath>(
  path: P,
  viewerUserId: UserId,
  snapshot: CorpusViewerRead<NoInfer<P>>,
): (input: TrpcInput<P>) => TrpcWireOutput<P> {
  if (snapshot.viewerUserId !== viewerUserId) {
    throw new Error(`Corpus snapshot viewer does not match ${path}`);
  }
  return createCorpusReadResponder(path, [snapshot.read]);
}

/** Selects captured reads by exact input; conflicting or missing captures refuse instead of inventing data. */
export function createCorpusReadResponder<P extends TrpcProcedurePath>(
  path: P,
  records: readonly CorpusRead<NoInfer<P>>[],
): (input: TrpcInput<P>) => TrpcWireOutput<P> {
  const captures = new Map<string | undefined, CorpusRead<P>>();
  for (const record of records) {
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
