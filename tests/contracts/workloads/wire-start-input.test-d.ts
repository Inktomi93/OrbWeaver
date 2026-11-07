import type { StartWorkloadInput, WireWorkloadKind, wireStartWorkloadEnvelope } from "@orb/contracts/workloads";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type WireStartWorkloadInput = z.infer<typeof wireStartWorkloadEnvelope>;

test("the wire names every kind but the route-started one", () => {
  expectTypeOf<WireStartWorkloadInput["kind"]>().toEqualTypeOf<WireWorkloadKind>();
  expectTypeOf<"import-bundle">().not.toExtend<WireWorkloadKind>();
  expectTypeOf<{ kind: "import-bundle"; params: Record<string, unknown> }>().not.toExtend<WireStartWorkloadInput>();
});

test("a wire import-st has no spelling for a staged upload, while the domain door's input keeps one", () => {
  expectTypeOf<keyof Extract<WireStartWorkloadInput, { kind: "import-st" }>["params"]>().toEqualTypeOf<"dryRun" | "personaCollisions">();
  expectTypeOf<"stagedDir" | "stagedDigest">().toExtend<keyof Extract<StartWorkloadInput, { kind: "import-st" }>["params"]>();
});

test("a literal naming a handle does not compile", () => {
  // @ts-expect-error a staged handle has no wire spelling
  const named: WireStartWorkloadInput = { kind: "import-st", params: { dryRun: true, stagedDir: "x" } };
  expectTypeOf(named).toExtend<WireStartWorkloadInput>();
});
