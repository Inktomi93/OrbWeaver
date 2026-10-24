import type { FormatStringKey, GuidedActionKind, TemplateDef } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import { expectTypeOf, test } from "vitest";
import type { ReasoningControl } from "#client/features/preset/lib/capability-panel-model.ts";
import type { TemplateRow } from "#client/features/preset/lib/template-rows.ts";

test("template rows choose exactly one canonical form-address family", () => {
  type Common = Pick<TemplateRow, "factoryDefault">;
  expectTypeOf<TemplateRow>().not.toHaveProperty("guidedKind");
  expectTypeOf<TemplateRow>().not.toHaveProperty("proseSlotId");
  expectTypeOf<TemplateRow["def"]["id"]>().toEqualTypeOf<TemplateDef["id"]>();
  expectTypeOf<Common & { def: TemplateDef & { id: GuidedActionKind } }>().toExtend<TemplateRow>();
  expectTypeOf<Common & { def: TemplateDef & { id: ProseSlotId } }>().toExtend<TemplateRow>();
  expectTypeOf<Common & { def: TemplateDef & { id: FormatStringKey } }>().toExtend<TemplateRow>();
});

test("reasoning controls correlate kind and capability without inventing a budget range", () => {
  expectTypeOf<{ kind: "none"; reasons: true }>().not.toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "effort"; reasons: true }>().not.toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "effort"; reasons: true; effortLevels: [] }>().toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "budget"; reasons: true }>().toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "adaptive"; reasons: true; effortLevels: [] }>().not.toExtend<ReasoningControl>();
});
