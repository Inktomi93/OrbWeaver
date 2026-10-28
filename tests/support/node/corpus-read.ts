import type { CorpusPlaybackCapture } from "../iso/corpus-playback.ts";
import type { CorpusCapture } from "../iso/corpus-read.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";

/** Native/private captures may bind any router procedure; only portable captures enter the ISO vocabulary. */
export type TrpcCapture<P extends TrpcProcedurePath> = CorpusCapture<TrpcInput<P>, TrpcWireOutput<P>>;

/** Root-produced playback is distinct from raw captures used by publication and native wire tests. */
export type TrpcPlaybackCapture<P extends TrpcProcedurePath> = CorpusPlaybackCapture<TrpcInput<P>, TrpcWireOutput<P>>;
