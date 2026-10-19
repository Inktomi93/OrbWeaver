// An empty state must say what the user does next (D62 rule 1). `action` is required; `null` is the stated "no next step".
import { EmptyState as Empty, EmptyState } from "@orb/ui/empty-state";
import type { ReactNode } from "react";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

type Props = Parameters<typeof EmptyState>[0];
declare const carried: { readonly action: ReactNode };
declare const uncarried: { readonly description: ReactNode };

test("an empty state without an action does not compile, under any import spelling", () => {
  // @ts-expect-error action is required
  createElement(EmptyState, { title: "Nothing here" });
  // @ts-expect-error an aliased import is the same primitive
  createElement(Empty, { title: "Nothing here" });
  // @ts-expect-error a spread that carries no action does not satisfy the requirement
  createElement(EmptyState, { title: "x", ...uncarried });
  expectTypeOf<Props>().toHaveProperty("action");
});

test("an action, an explicit null, or a spread carrying the action satisfies it", () => {
  createElement(EmptyState, { title: "Nothing here", action: createElement("button", { type: "button" }, "Go") });
  createElement(EmptyState, { title: "Nothing here", action: null });
  createElement(EmptyState, { title: "x", ...carried });
  expectTypeOf<Props["action"]>().toEqualTypeOf<ReactNode>();
});

function EmptyStateLike(props: { readonly title: string }): string {
  return props.title;
}

test("a local component with the primitive's name keeps its own contract", () => {
  createElement(EmptyStateLike, { title: "Nothing here" });
  expectTypeOf(EmptyStateLike).parameter(0).toEqualTypeOf<{ readonly title: string }>();
});
