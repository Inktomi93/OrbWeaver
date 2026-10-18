// Type-level pin for the stack grammar + identity vocabulary. Two properties no runtime test can see:
//   • the parse result is a DISCRIMINATED union — an `ok:false` result carries no `invocation`, so a
//     caller cannot read one without narrowing (the cli exits 2 on the error arm);
//   • every identity verdict the classifier can emit is a verdict the up/down deciders handle.
import { expectTypeOf, test } from "vitest";
import type { InstanceClassification, InstanceVerdict, STACK_VERBS, StackParse, StackVerb } from "../../../../tooling/src/stack/index.ts";

declare const parsed: StackParse;

test("StackVerb derives from the tuple — one axis, no re-spell", () => {
  expectTypeOf<(typeof STACK_VERBS)[number]>().toEqualTypeOf<StackVerb>();
});

test("a failed parse cannot be read as an invocation", () => {
  // @ts-expect-error — `invocation` exists only on the ok:true arm; the shell must narrow first.
  void parsed.invocation;
  expectTypeOf<Extract<StackParse, { ok: true }>["invocation"]["verb"]>().toEqualTypeOf<StackVerb>();
});

test("the classifier's verdicts are exactly the ones the deciders switch on", () => {
  expectTypeOf<InstanceClassification["verdict"]>().toEqualTypeOf<InstanceVerdict>();
});
