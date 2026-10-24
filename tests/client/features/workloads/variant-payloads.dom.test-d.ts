import { expectTypeOf, test } from "vitest";
import type { ImportSummary } from "#client/features/workloads/lib/portability-model.ts";

test("import failures cannot carry successful skipped-plane notes", () => {
  type Outcome = ImportSummary["outcomes"][number];
  type Common = Pick<Outcome, "path" | "detail">;
  expectTypeOf<Common & { ok: false; notes: readonly string[] }>().not.toExtend<Outcome>();
  expectTypeOf<Common & { ok: false }>().toExtend<Outcome>();
  expectTypeOf<Common & { ok: true }>().toExtend<Outcome>();
  expectTypeOf<Common & { ok: true; notes: readonly string[] }>().toExtend<Outcome>();
});
