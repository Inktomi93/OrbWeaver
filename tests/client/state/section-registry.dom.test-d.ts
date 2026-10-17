import type { SectionDefinition } from "@orb/client/state";

declare const base: Pick<SectionDefinition, "id" | "rail" | "panelDefaults" | "placeholder" | "contentInset" | "useSelectionTitle">;
declare const list: Required<Pick<SectionDefinition, "list" | "useListHeader" | "listSearch" | "selection">>;

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
void [planned, live, plannedList, plannedHeader, plannedContext];
