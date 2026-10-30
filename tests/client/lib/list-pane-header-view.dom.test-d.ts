import type { ListPaneHeaderView } from "@orb/client/lib";
import { Plus } from "@orb/ui/icons";
import { expectTypeOf, test } from "vitest";

test("a list band action must declare at least one menu form", () => {
  const declared: ListPaneHeaderView = {
    title: "Band",
    actions: [{ id: "new", inline: null, menu: [{ id: "new", label: "New", icon: Plus, onSelect: () => undefined }] }],
  };
  // @ts-expect-error an action with no menu form has no way to stay reachable when the band overflows
  const missing: ListPaneHeaderView = { title: "Band", actions: [{ id: "new", inline: null }] };
  // @ts-expect-error an empty menu form list is the same loss
  const empty: ListPaneHeaderView = { title: "Band", actions: [{ id: "new", inline: null, menu: [] }] };
  expectTypeOf([declared, missing, empty]).toEqualTypeOf<ListPaneHeaderView[]>();
});
