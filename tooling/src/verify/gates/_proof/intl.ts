// The two ambient-global plants `no-raw-intl-time`'s `Intl.<Formatter>` arm resolves its GLOBAL-branch
// identity fences against — the two halves of `globalName === INTL && memberPath.length === 1`.
//
// WHY PLANTS ARE NEEDED HERE AT ALL, given that `Intl` itself needs none. The proof workspace loads
// TypeScript's own lib files, which ARE one of the two trusted homes, so a plain `Intl.DateTimeFormat`
// fixture reaches the precise branch unaided (`_proof/node-types.ts` records exactly that asymmetry). What
// the lib CANNOT supply is a COUNTEREXAMPLE: `DateTimeFormat` and `RelativeTimeFormat` are declared nowhere
// in `lib.*.d.ts` except inside `declare namespace Intl`, so on the shipped lib alone every resolvable
// formatter-named read answers `globalName: "Intl"` with a one-long member path — both fences are true
// together for every reachable expression, and neither can be falsified. The plants below are the
// counterexamples, one per fence, and each is the MINIMUM difference from the real shape.
//
// WHICH ACCEPTANCE BRANCH THEY TAKE, and why the fences under test are independent of it (#2037).
// `isAmbientGlobalDeclaration` accepts either a script-global declaration file or a `global` augmentation,
// and a plant that resolves through the wrong branch can prove nothing about the branch the live tree takes.
// Both files here are SCRIPT-GLOBAL, which is the same choice `_proof/node-types.ts` makes for its
// lookalikes and for the same reason: these mimic no shipped package, and keeping them on that branch leaves
// both branches exercised across the corpus. It is sound for these fences because the clauses under test sit
// DOWNSTREAM of acceptance entirely — `resolveGlobalMemberOrigin` has already returned `kind: "resolved"`
// before either comparison runs, so the branch decides only WHETHER a `GlobalMemberOrigin` exists, never
// what its `globalName` or `memberPath` are. The live `Intl` read these rows fence resolves through
// `lib.*.d.ts`; the augmentation plant merges into that same symbol and does not move it.
const INTL_LOOKALIKE_HOME = "node_modules/@types/intl-lookalike/index.d.ts";
const INTL_NESTED_HOME = "node_modules/@types/intl-nested/index.d.ts";

/** A DIFFERENT trusted ambient global carrying a member named exactly `DateTimeFormat`. Nothing but the
 *  resolved global NAME separates `Formats.DateTimeFormat` from `Intl.DateTimeFormat` — the member path is
 *  one long in both — so this is the only fixture that reaches the `globalName === INTL` comparison with a
 *  different answer. */
export function intlLookalikeProof(): Readonly<Record<string, string>> {
  return { [INTL_LOOKALIKE_HOME]: "declare var Formats: {\n  DateTimeFormat: new (locale: string) => unknown;\n};\n" };
}

/** The REAL `Intl` namespace, augmented with one nested member that carries a formatter name. Declaration
 *  merging keeps `globalName` at `"Intl"`, so `Intl.legacy.DateTimeFormat` differs from the live shape in
 *  member-path DEPTH alone — the only fixture that reaches `memberPath.length === 1` with a different
 *  answer. */
export function intlNestedProof(): Readonly<Record<string, string>> {
  return {
    [INTL_NESTED_HOME]: "declare namespace Intl {\n  const legacy: {\n    DateTimeFormat: new (locale: string) => unknown;\n  };\n}\n",
  };
}
