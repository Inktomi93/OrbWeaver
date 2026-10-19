import type { CollectionContribution } from "@orb/client/lib";
import { expectTypeOf, test } from "vitest";

declare const base: Pick<CollectionContribution, "emptyText" | "useMemberTitle" | "list" | "detail" | "context">;
declare const useRun: CollectionContribution["create"]["useRun"];
declare const useImport: NonNullable<CollectionContribution["importFile"]>["useRun"];

test("a collection declares its create and import doors as data the host draws", () => {
  const complete: CollectionContribution = {
    ...base,
    create: { label: "New item", useRun },
    importFile: { label: "Import", accept: ".json", useRun: useImport },
  };
  // @ts-expect-error a rendered create affordance is a second create grammar in the list
  const renderedCreate: CollectionContribution = { ...base, create: () => null };
  // @ts-expect-error a create door without a runner hook cannot act
  const unwiredCreate: CollectionContribution = { ...base, create: { label: "New item" } };
  // @ts-expect-error an import door without an accept filter leaves the host to guess the file picker
  const unfiltered: CollectionContribution = { ...base, create: { label: "New item", useRun }, importFile: { label: "Import", useRun: useImport } };
  expectTypeOf([complete, renderedCreate, unwiredCreate, unfiltered]).toEqualTypeOf<CollectionContribution[]>();
});
