// #1301 compile-time trust-boundary controls: arm/schema/data and identity brands must not mix.
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type { ArtifactRef, ContextIndex, PageIndex } from "../../../../tooling/src/_shared/artifact-scope.ts";
import { contextIndex, pageIndex } from "../../../../tooling/src/_shared/artifact-scope.ts";
import type { Arm } from "../../../../tooling/src/snap/contract/arm-vocabulary.ts";
import type { ARM_FACT_DATA_SCHEMAS, ArmFactDataByArm, ArmFactSchemaIdByArm } from "../../../../tooling/src/snap/contract/run-facts.ts";

test("arm fact grammar is total and discriminated", () => {
  const aria: ArmFactDataByArm["aria"] = { state: "passed", detail: null, captures: 1, failures: 0 };
  expectTypeOf(aria).toEqualTypeOf<ArmFactDataByArm["aria"]>();
  expectTypeOf<ArmFactDataByArm["aria"]>().not.toEqualTypeOf<ArmFactDataByArm["heap"]>();
  expectTypeOf<ArmFactSchemaIdByArm["aria"]>().not.toEqualTypeOf<ArmFactSchemaIdByArm["heap"]>();
  expectTypeOf<typeof ARM_FACT_DATA_SCHEMAS>().toExtend<Readonly<Record<Arm, z.ZodType>>>();
});

test("scope and artifact identities cannot cross boundary roles", () => {
  const page = pageIndex(0);
  const context = contextIndex(0);
  expectTypeOf(page).toEqualTypeOf<PageIndex>();
  expectTypeOf(context).toEqualTypeOf<ContextIndex>();
  expectTypeOf<PageIndex>().not.toEqualTypeOf<ContextIndex>();

  expectTypeOf<PageIndex>().not.toEqualTypeOf<ContextIndex>();
  expectTypeOf<ArtifactRef>().not.toEqualTypeOf<string>();
});
