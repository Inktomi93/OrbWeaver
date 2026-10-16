import { expectTypeOf, test } from "vitest";
import type { CorpusProcedurePath, CorpusProcedures, CorpusRead } from "../iso/corpus-read.ts";
import type { TrpcCapture } from "./corpus-read.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";

type UnboundCapturePaths = Exclude<CorpusProcedurePath, TrpcProcedurePath>;

type RouterCaptures = {
  readonly [P in CorpusProcedurePath]: P extends TrpcProcedurePath ? TrpcCapture<P> : never;
};

test("every portable capture has the canonical router input and complete serialized output", () => {
  expectTypeOf<UnboundCapturePaths>().toEqualTypeOf<never>();
  expectTypeOf<CorpusProcedures>().toEqualTypeOf<RouterCaptures>();
});

test("portable capture inputs distinguish absent input from a present required object", () => {
  expectTypeOf<undefined>().toExtend<CorpusRead<"sessions.me">["input"]>();
  expectTypeOf<object>().not.toExtend<CorpusRead<"sessions.me">["input"]>();
  expectTypeOf<undefined>().not.toExtend<CorpusRead<"databank.list">["input"]>();
  expectTypeOf<null>().not.toExtend<CorpusRead<"notifications.list">["input"]>();
  expectTypeOf<CorpusRead<"notifications.list">["input"]>().toExtend<TrpcInput<"notifications.list">>();
  expectTypeOf<CorpusRead<"plugin.getSurfaceState">["output"]>().toEqualTypeOf<TrpcWireOutput<"plugin.getSurfaceState">>();
  expectTypeOf<CorpusRead<"search.search">["output"]>().toEqualTypeOf<TrpcWireOutput<"search.search">>();
});
