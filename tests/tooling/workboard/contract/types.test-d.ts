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
    | "help"
    | "overview"
    | "show"
    | "list"
    | "create"
    | "file"
    | "land"
    | "claim"
    | "ready"
    | "review"
    | "needs-owner"
    | "set"
    | "verify"
    | "reverify"
    | "done"
    | "refute"
    | "dod"
    | "park"
    | "block"
    | "unblock"
  >();
  // Every lifecycle arm is also a WorkCommand arm — runLifecycle's switch is total over the same set.
  expectTypeOf<LifecycleCommand>().toExtend<WorkCommand>();
});

test("each lifecycle verb carries its OWN payload, never a bag of optionals", () => {
  expectTypeOf<Extract<WorkCommand, { kind: "claim" }>>().toEqualTypeOf<{
    readonly kind: "claim";
    readonly issues: readonly number[];
    readonly lane: string;
  }>();
  expectTypeOf<Extract<WorkCommand, { kind: "block" }>["blocker"]>().toEqualTypeOf<number>();
  // @ts-expect-error — `ready` carries no evidence; a verb may not be handed another verb's payload.
  const wrong: Extract<WorkCommand, { kind: "ready" }> = { kind: "ready", issues: [1], evidence: "x" };
  void wrong;
});

// #870's own type-level half: EVERY lifecycle arm carries a LIST, so a new arm added with a single
// `issue: number` cannot compile — that asymmetry is exactly how a verb would quietly opt out of the
// batching and reintroduce the per-row call cost the census measured.
test("every lifecycle verb is batched — the id payload is a LIST on every arm", () => {
  expectTypeOf<LifecycleCommand["issues"]>().toEqualTypeOf<readonly number[]>();
  expectTypeOf<Extract<WorkCommand, { kind: "show" }>["issues"]>().toEqualTypeOf<readonly number[]>();
  // `land` carries the closing sequence's whole payload: one receipt, an optional lane, an optional comment.
  expectTypeOf<Extract<WorkCommand, { kind: "land" }>["evidence"]>().toEqualTypeOf<string>();
  expectTypeOf<Extract<WorkCommand, { kind: "land" }>["lane"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Extract<WorkCommand, { kind: "land" }>["commentFile"]>().toEqualTypeOf<string | null>();
});

// #923's type-level half: the DoD payloads are per-verb, `string | null` on exactly the arms that carry
// them — never a bag of optionals a dispatcher could hand to the wrong verb. `override` (the loud
// --force-close record) exists ONLY on the two closing verbs; a bare `verify` cannot carry one.
test("the DoD payloads live on exactly the arms that carry them", () => {
  expectTypeOf<Extract<WorkCommand, { kind: "file" }>["dod"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Extract<WorkCommand, { kind: "refute" }>["dod"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Extract<WorkCommand, { kind: "dod" }>["command"]>().toEqualTypeOf<string>();
  expectTypeOf<Extract<WorkCommand, { kind: "done" }>["override"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Extract<WorkCommand, { kind: "land" }>["override"]>().toEqualTypeOf<string | null>();
  // @ts-expect-error — `verify` carries no override; only the closing verbs may record one.
  const wrong: Extract<WorkCommand, { kind: "verify" }> = { kind: "verify", issues: [1], evidence: "x", override: "y" };
  void wrong;
});
