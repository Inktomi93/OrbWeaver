import type { ContextTabsSpec, ListPaneHeaderView } from "@orb/client/lib";
import type { SectionDefinition } from "@orb/client/state";
import type { ReactNode } from "react";
import { expectTypeOf, test } from "vitest";

type ListSection = Extract<SectionDefinition, { readonly list: () => ReactNode }>;

test("a list section requires shell-renderable header data", () => {
  expectTypeOf<ListSection["useListHeader"]>().toEqualTypeOf<() => ListPaneHeaderView>();
  expectTypeOf<Omit<ListSection, "useListHeader">>().not.toExtend<SectionDefinition>();
  expectTypeOf<Omit<ListSection, "listSearch">>().not.toExtend<SectionDefinition>();
  expectTypeOf<Omit<ListSection, "contentInset">>().not.toExtend<SectionDefinition>();
});

test("context identity and inset opt-outs cannot be omitted", () => {
  expectTypeOf<Omit<ContextTabsSpec<void>, "header">>().not.toExtend<ContextTabsSpec<void>>();
  expectTypeOf<{ planned: string }>().toExtend<SectionDefinition["contentInset"]>();
  expectTypeOf<{}>().not.toExtend<SectionDefinition["contentInset"]>();
});
