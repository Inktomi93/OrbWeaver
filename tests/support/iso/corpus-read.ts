import type { UserId } from "@orb/kit/ids";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "../node/route-trpc.ts";

/** A production route capture; inputs retain their presence and their canonical procedure type. */
export interface CorpusRead<P extends TrpcProcedurePath> {
  readonly input: TrpcInput<P>;
  readonly output: TrpcWireOutput<P>;
}

/** A captured viewer is fixture-selection evidence, never a browser authentication credential. */
export interface CorpusViewerRead<P extends TrpcProcedurePath> {
  readonly viewerUserId: UserId;
  readonly read: CorpusRead<P>;
}
