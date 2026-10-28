import type { UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { CorpusPlayback, CorpusWire } from "../iso/corpus.ts";
import type { CorpusPlaybackView } from "../iso/corpus-playback.ts";
import type { CorpusPlaybackRead, CorpusProcedurePath, CorpusProcedures, CorpusRead } from "../iso/corpus-read.ts";
import type { captureCorpusRead } from "./corpus-capture.ts";
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

test("raw pairs and spread inspection fields are not admitted playback", () => {
  type Read = CorpusPlaybackRead<"character.list">;
  type Spread = Pick<Read, "input" | "output">;
  expectTypeOf<CorpusRead<"character.list">>().not.toExtend<Read>();
  expectTypeOf<Spread>().not.toExtend<Read>();
  expectTypeOf<Read>().toExtend<CorpusRead<"character.list">>();
  expectTypeOf<Awaited<ReturnType<typeof captureCorpusRead<"character.list">>>>().toEqualTypeOf<Read>();
  expectTypeOf<CorpusPlaybackView<UserId>>().toEqualTypeOf<UserId>();
  expectTypeOf<CorpusPlayback>().toExtend<CorpusWire>();
});
