// A belt is total only when it names exactly its union's discriminators. The tuple spelling proves membership,
// never totality, so the registry derives the gap per bus and these assertions hold it at never.
import type { BeltMismatch, BeltMismatchOf, BusName, SubUnionEscape } from "@orb/testkit/iso";
import { expectTypeOf, test } from "vitest";

type Rpg = { readonly type: "sheetChanged" } | { readonly type: "rollResolved" };
type Chat = { readonly type: "delta" } | { readonly type: "typing" };

test("every registered belt carries exactly its union's discriminators", () => {
  expectTypeOf<BeltMismatch>().toEqualTypeOf<{ readonly [Name in BusName]: never }>();
});

test("every sub-union is contained by the belted root it names", () => {
  expectTypeOf<SubUnionEscape>().toEqualTypeOf<{ readonly [Name in keyof SubUnionEscape]: never }>();
});

test("the mismatch names a tuple belt that omits a member", () => {
  expectTypeOf<BeltMismatchOf<Rpg, readonly ["sheetChanged"]>>().toEqualTypeOf<"rollResolved">();
});

test("the mismatch names a belt member the union does not declare", () => {
  expectTypeOf<BeltMismatchOf<Rpg, readonly ["sheetChanged", "rollResolved", "ghost"]>>().toEqualTypeOf<"ghost">();
});

test("a belt that is both short and foreign reports both halves", () => {
  expectTypeOf<BeltMismatchOf<Rpg, readonly ["sheetChanged", "ghost"]>>().toEqualTypeOf<"rollResolved" | "ghost">();
});

test("total tuple and object belts report nothing", () => {
  expectTypeOf<BeltMismatchOf<Rpg, readonly ["sheetChanged", "rollResolved"]>>().toBeNever();
  expectTypeOf<BeltMismatchOf<Chat, { readonly delta: true; readonly typing: true }>>().toBeNever();
});

test("an object belt that omits a member or invents one is named", () => {
  expectTypeOf<BeltMismatchOf<Chat, { readonly delta: true }>>().toEqualTypeOf<"typing">();
  expectTypeOf<BeltMismatchOf<Chat, { readonly delta: true; readonly typing: true; readonly ghost: true }>>().toEqualTypeOf<"ghost">();
});
