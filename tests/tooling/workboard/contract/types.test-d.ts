// Type-level pin for the Project-1 operator command vocabulary. Two properties no runtime test can see:
//   • `WorkCommand` is CLOSED over the verbs the dispatcher switches on — a new arm added to the union
//     without a dispatch case (or a case for a kind the union does not carry) fails here, which is the
//     compile-time half of "a verb is invented in exactly one place" (lib/parse.ts);
//   • the lifecycle payload is per-verb, not a bag of optionals: `claim` carries a lane and NOTHING else,
//     `verify`/`done` carry evidence, `block`/`unblock` carry a numeric blocker. A refactor that widened
//     these to `{ lane?: string; evidence?: string }` would let the cli hand a verb the wrong payload.
import { expectTypeOf, test } from "vitest";
import type { LifecycleCommand, WorkCommand } from "../../../../tooling/src/workboard/index.ts";

type KindOf<T> = T extends { readonly kind: infer K } ? K : never;

test("WorkCommand is closed over exactly the verbs the dispatcher handles", () => {
  expectTypeOf<KindOf<WorkCommand>>().toEqualTypeOf<
    "help" | "show" | "list" | "create" | "claim" | "ready" | "review" | "needs-owner" | "set" | "verify" | "reverify" | "done" | "park" | "block" | "unblock"
  >();
  // Every lifecycle arm is also a WorkCommand arm — runLifecycle's switch is total over the same set.
  expectTypeOf<LifecycleCommand>().toMatchTypeOf<WorkCommand>();
});

test("each lifecycle verb carries its OWN payload, never a bag of optionals", () => {
  expectTypeOf<Extract<WorkCommand, { kind: "claim" }>>().toEqualTypeOf<{ readonly kind: "claim"; readonly issue: number; readonly lane: string }>();
  expectTypeOf<Extract<WorkCommand, { kind: "block" }>["blocker"]>().toEqualTypeOf<number>();
  // @ts-expect-error — `ready` carries no evidence; a verb may not be handed another verb's payload.
  const wrong: Extract<WorkCommand, { kind: "ready" }> = { kind: "ready", issue: 1, evidence: "x" };
  void wrong;
});
