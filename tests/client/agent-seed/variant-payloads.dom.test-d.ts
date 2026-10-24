import { expectTypeOf, test } from "vitest";
import type { HandWriteResult } from "#client/agent-seed/index.ts";

test("the seeder cannot erase a hand-write refusal reason", () => {
  expectTypeOf<{ ok: false }>().not.toExtend<HandWriteResult>();
  expectTypeOf<{ ok: true; reason: string }>().not.toExtend<HandWriteResult>();
  expectTypeOf<{ ok: false; reason: string }>().toExtend<HandWriteResult>();
  expectTypeOf<{ ok: true }>().toExtend<HandWriteResult>();
});
