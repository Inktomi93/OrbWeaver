import type { GeneratedImage } from "@orb/inference";
import { expectTypeOf, test } from "vitest";
import type { SeededSessionDecision } from "#inference/contract/agent-sdk-backend.ts";
import type { LocalLightWorkerValue } from "#inference/contract/local-light-worker.ts";

test("generated images choose exactly one source without removing URL support", () => {
  expectTypeOf<{ url: string; base64: string; mediaType: string }>().not.toExtend<GeneratedImage>();
  expectTypeOf<{ url: undefined; base64: undefined; mediaType: string }>().not.toExtend<GeneratedImage>();
  expectTypeOf<{ url: string; mediaType: string }>().toExtend<GeneratedImage>();
  expectTypeOf<{ base64: string; mediaType: string }>().toExtend<GeneratedImage>();
});

test("seeded session dispositions determine whether an existing session can be resumed", () => {
  expectTypeOf<{ disposition: "resumed"; sessionId: null }>().not.toExtend<SeededSessionDecision>();
  expectTypeOf<{ disposition: "fresh"; sessionId: NonNullable<SeededSessionDecision["sessionId"]> }>().not.toExtend<SeededSessionDecision>();
  expectTypeOf<{ disposition: "fresh"; sessionId: null }>().toExtend<SeededSessionDecision>();
  expectTypeOf<{ disposition: "cleared"; sessionId: null }>().toExtend<SeededSessionDecision>();
});

test("worker result payloads remain tied to their operation", () => {
  expectTypeOf<{ op: "scorePairs"; value: Float32Array[] }>().not.toExtend<LocalLightWorkerValue>();
  expectTypeOf<{ op: "embedTexts"; value: number[] }>().not.toExtend<LocalLightWorkerValue>();
  expectTypeOf<{ op: "preload"; value: Float32Array[] }>().not.toExtend<LocalLightWorkerValue>();
  expectTypeOf<{ op: "preload"; value: null }>().toExtend<LocalLightWorkerValue>();
  expectTypeOf<{ op: "scorePairs"; value: number[] }>().toExtend<LocalLightWorkerValue>();
});
