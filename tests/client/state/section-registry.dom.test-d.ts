import type { SectionDefinition } from "@orb/client/state";
import { expectTypeOf, test } from "vitest";

declare const base: Pick<SectionDefinition, "id" | "rail" | "panelDefaults" | "placeholder" | "contentInset" | "useSelectionTitle">;
declare const list: Required<Pick<SectionDefinition, "list" | "useListHeader" | "listSearch" | "selection">>;

test("planned section content cannot carry a list, a header or a rendered context", () => {
  const planned: SectionDefinition = { ...base, content: { planned: "Tracked delivery" }, context: { kind: "none" } };
  const live: SectionDefinition = { ...base, ...list, content: () => null, context: { kind: "none" } };
  // @ts-expect-error planned content cannot carry a real list
  const plannedList: SectionDefinition = { ...base, ...list, content: { planned: "Tracked delivery" }, context: { kind: "none" } };
  // @ts-expect-error planned content cannot carry a real header
  const plannedHeader: SectionDefinition = { ...base, content: { planned: "Tracked delivery" }, header: () => null, context: { kind: "none" } };
  // @ts-expect-error planned content cannot carry a rendered context
  const plannedContext: SectionDefinition = {
    ...base,
    content: { planned: "Tracked delivery" },
    context: { kind: "single", body: () => null, header: () => null },
  };
  expectTypeOf([planned, live, plannedList, plannedHeader, plannedContext]).toEqualTypeOf<SectionDefinition[]>();
});

test("a section declares live content or a planned reason, never neither", () => {
  // @ts-expect-error a section with no content and no planned reason is the refinery bug
  const bare: SectionDefinition = { ...base, context: { kind: "none" } };
  expectTypeOf(bare).toEqualTypeOf<SectionDefinition>();
});
