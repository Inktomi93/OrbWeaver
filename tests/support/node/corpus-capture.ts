// A capture always executes the actual procedure on a composed root; callers supply no response or callback.
import type { UserId } from "@orb/kit/ids";
import type { CorpusPlaybackCapture } from "../iso/corpus-playback.ts";
import { admitCorpusCapture, lockCorpusInput } from "../iso/corpus-playback.ts";
import { procedureAt } from "./corpus-procedure.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";
import type { ServerProducerRoot } from "./server.ts";
import { assertServerProducerRoot } from "./server.ts";

/** Capture one real request as its selected viewer; this is fixture selection, not HTTP authentication. */
export async function captureCorpusRead<Path extends TrpcProcedurePath>(
  root: ServerProducerRoot,
  viewerUserId: UserId,
  path: Path,
  input: TrpcInput<NoInfer<Path>>,
): Promise<CorpusPlaybackCapture<TrpcInput<Path>, TrpcWireOutput<Path>>> {
  assertServerProducerRoot(root);
  const capturedInput = lockCorpusInput(input);
  const caller = await root.internalCallerFor(viewerUserId);
  const output = await procedureAt(caller, path)(capturedInput);
  // The real router owns the result's schema; the network round-trip erases brands and absent output.
  const wire = JSON.parse(JSON.stringify(output ?? null)) as TrpcWireOutput<Path>;
  return admitCorpusCapture(path, viewerUserId, { input: capturedInput, output: wire });
}
