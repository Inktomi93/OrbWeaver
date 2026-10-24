import type { WorkloadId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { UnderstandingPassView } from "#client/features/discovery/hooks/use-understanding-pass.ts";

test("an understanding pass run carries its identity while optional progress stays independent", () => {
  type Common = Pick<UnderstandingPassView, "detail" | "fraction" | "memoryDisabled" | "start" | "starting" | "onLiveProgress" | "confirm">;
  expectTypeOf<Common & { running: true; stage: null; liveRunId: null; failure: null; failureWasCrash: false }>().not.toExtend<UnderstandingPassView>();
  expectTypeOf<
    Common & { running: true; stage: string; liveRunId: WorkloadId; failure: string; failureWasCrash: false }
  >().not.toExtend<UnderstandingPassView>();
  expectTypeOf<Common & { running: true; stage: string; liveRunId: WorkloadId; failure: null; failureWasCrash: false }>().toExtend<UnderstandingPassView>();
  expectTypeOf<Common & { running: false; stage: null; liveRunId: null; failure: null; failureWasCrash: true }>().toExtend<UnderstandingPassView>();
});
