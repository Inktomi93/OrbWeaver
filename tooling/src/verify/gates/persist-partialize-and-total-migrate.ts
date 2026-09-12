// Gate: persist-partialize-and-total-migrate (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md
// §13.1/§13.3). Zustand `persist()` is partly IRREVERSIBLE — once a stale blob is in localStorage you
// can't migrate from a version line never shipped, so every persist must route through one of the two
// minting factories that bake `partialize` + `version` + a TOTAL crash-proof `migrate`.
//
// ARM A RETIRED AS A DUPLICATE (2026-09-11, converting for #1584). The legacy module's ARM A — a bare
// `persist(` call outside the two factories is RED — is the EXACT rule `no-raw-zustand-persist.ts`
// already enforces under its `persistMint` operation (authority reviewed-grant), with a STRONGER
// identity reader: the legacy check here was `Node.isIdentifier(callee) && callee.getText() === "persist"`,
// which an aliased import (`import { persist as durable } from "zustand/middleware"`) walks straight past;
// `no-raw-zustand-persist` resolves the callee's package-export origin instead and catches the alias.
// Converting ARM A again would ship a second, weaker gate over the identical subject. Its successor proof
// lives in tests/tooling/verify/gates/simple-visitors-wave-4.test.ts (replays every legacy ARM A
// mustFlag/mustPass example through no-raw-zustand-persist and asserts it still holds).
//
// This policy now covers ONLY the genuinely distinct arm: inside each factory, the persist() options
// object must carry `version`/`partialize`/`migrate` — nothing else on the tree checks factory-option
// completeness. Population is narrowed to exactly the two factory files (no `scanRoot` predicate, no
// FACTORY_FILES set lookup at runtime): the two paths are declared data the population algebra resolves
// once, and a rename tripwire is unnecessary here because a moved factory simply drops out of `ctx.files`
// and its `persist()` requirement goes unjudged — the SAME shape `no-raw-zustand-persist`'s reviewed-grant
// staleness sweep already polices for arm A's identity, so a moved factory is caught there, not duplicated
// here.
//
// THE IDENTITY HALF WAS THE RETIRED ARM'S OWN WEAKNESS, KEPT (#2089, 2026-09-12). The header above retires
// ARM A precisely BECAUSE `Node.isIdentifier(callee) && getText() === "persist"` "walks straight past an
// aliased import" — and then the SURVIVING arm was left reading the callee with that exact predicate. Since
// `no-raw-zustand-persist` judges the MINT and this policy judges the OPTIONS, deferring identity to the
// sibling left the alias unjudged by ANYTHING inside the one place the mint is sanctioned. Measured against
// the unmodified module: `persist(() => ({}), { version })` → 1 finding; `import { persist as durable }` +
// `durable(() => ({}), { version })` → 0; and — the other direction of the same hole — a file-local helper
// literally named `persist` → 1, an accusation against code that is not zustand's middleware at all. Both
// halves are now the sibling's reader, `lib/project-home-origin.ts#readPackageExportOrigin`, over the same
// `zustand` package identity.
//
// FAIL-CLOSED, BEHIND A NAME PREFILTER (the `lib/origin-verdict.ts` rule). This arm ACCUSES, so an
// UNREADABLE callee must not acquit — an options object nobody can place is exactly where a missing
// `migrate` hides. The prefilter is the candidate set the legacy predicate already had (the spelling
// `persist`) plus the local names this file bound zustand's `persist` export to at an import specifier, so
// fail-closure never reaches a call outside it: `create(...)` in the same factory resolves nothing and is
// never asked.
//
// THE OPTIONS EXPRESSION IS RESOLVED, NOT REQUIRED INLINE. `persist(init, opts)` through an immutable const
// hop read 0 before #2089 — the options object is the whole subject, and a one-identifier hop is not a
// different program. The hop is the SHARED stable-binding reader `lib/reference-fact.ts#resolveStableExpression`
// (the same one `windowed-infinite-query` uses for the identical shape), which follows const bindings and
// import doors and REFUSES on a write, a cycle or a dynamic terminal.
//
// A SPREAD IS READ THROUGH THE SAME DOOR, AND THE OLD BEHAVIOUR WAS A FALSE POSITIVE, not a limit. The
// first draft of this fix carried a `mustPass` row declaring a spread's keys invisible; RUNNING it showed
// `persist(init, { ...base })` with all three keys in `base` reporting all three MISSING, because
// `getProperty("version")` finds no name on a `SpreadAssignment`. `presentKeys` therefore unions each
// spread's resolved object literal, and the un-resolvable half of that branch is the fail-closed arm: a
// spread the reader REFUSES (a call, a reassigned binding) contributes no keys, so the guards are unproven
// and the call site is reported — the direction an accusing arm owes, since the opposite answer would let
// `{ ...buildOptions() }` retire this policy in one line. Both halves carry a row.
//
// §4.1 NARROWING MATRIX, measured 2026-09-12 by cutting each fence in a sibling scratch module (one module
// PER CUT — `import()` caches by URL, and a shared scratch filename silently re-measured the first cut for
// four cells here before that was fixed) and re-running this module's own rows. Every anchor was asserted to
// occur EXACTLY ONCE first:
//   identity read OPEN (`verdict !== "other"` → `true`)   → RED ×2 (the local-helper row, the lookalike row)
//   identity read FAIL-OPEN (`!== "other"` → `=== "home"`) → RED ×1 (the unresolvable-import row) — the
//                                                            per-ARM question's own falsifier, and the cell
//                                                            the OTHER identity cut cannot reach
//   alias prefilter narrowed to the bare spelling          → RED ×1 (the alias row)
//   const-hop reader OPEN (inline literals only)           → RED ×2 (the const-hop row, the spread row)
//   spread branch removed from `presentKeys`               → RED ×1 (the spread row)
//   population widened to the whole `@client`              → RED ×1 (the out-of-factory row, which carries
//                                                            an in-population anchor beside it)
//
// SINGLETON FAMILY: the verdict — "are these three keys present on this options object" — composes with no
// other policy's computation; `no-raw-zustand-persist` shares two `lib/` READERS with it and asks a
// different question (may this call exist at all), which is a shared primitive, not a family. Corpus-wide,
// ten policies across ten families ride these readers.
//
// ONE FINDING PER CALL SITE, NOT PER MISSING KEY (#1954, 2026-09-11). The conversion's first shape emitted
// one finding per absent key, all anchored on the same `persist` callee with the same position token, which
// made this ORDINARY policy PERMANENTLY UNWAIVABLE: `lib/ordinary-waiver.ts` narrows a marker's candidates by
// carrier containment and then by `finding.token === marker.position`, so byte-identical findings always
// resolve `over-broad` and suppress NOTHING — a second marker made it worse, not better. The legacy
// descriptor dodged this with SYNTHETIC per-key tokens (`persist opts missing <key>`), which the final
// runtime forbids: `locateFinding` requires the position token to be an exact slice of the authored source
// at the reported line/column, and an ABSENT key has no authored text to anchor on. So the offense is the
// CALL SITE, the missing keys are named in the per-finding message, and one `@orb-waive
// persist-partialize-and-total-migrate(persist): <reason>` above the statement reaches it.
//
// POPULATION PORT: a deliberate NARROWING, and the reason is ARM A's retirement above. Legacy
// `scanRoot: (p) => p.includes("packages/client/src/")` had to reach the whole client tree because ARM A
// judged every `persist(` call anywhere; with ARM A retired to `no-raw-zustand-persist`, the only
// surviving question is whether the two MINTING FACTORIES pass complete options, so the population is
// exactly those two files. The narrowing is what makes the out-of-factory `mustPass` row meaningful, and
// the §4.1 matrix above pins it (population widened to the whole `@client` → RED x1).
// LEGACY SHA: (61aa46279^) — the conversion's parent.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import { resolveStableExpression } from "../lib/reference-fact.ts";
import { storeLookalikeProof, zustandProof } from "./_proof/zustand.ts";

const FACTORY_PERSISTED_STORE = "packages/client/src/state/create-persisted-store.ts";
const FACTORY_ENTITY_DRAFT_STORE = "packages/client/src/state/create-entity-draft-store.ts";
const REQUIRED_KEYS = ["version", "partialize", "migrate"] as const;
const ZUSTAND = "zustand";
const PERSIST = "persist";
const PERSIST_NAMES: ReadonlySet<string> = new Set([PERSIST]);

const MESSAGE =
  "the mint factory's own persist() options object is missing a required irreversibility guard — " +
  "version/partialize/migrate must all be present so a stale localStorage blob can always migrate " +
  "forward instead of crashing (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md §13.1/§13.3).";

/** The per-finding message: the CALL SITE is the offense, so the absent keys are enumerated in the text
 *  rather than split across identical findings the ordinary waiver could never address individually. */
function missingKeysMessage(missing: readonly string[]): string {
  return (
    `the mint factory's own persist() options object is missing ${missing.join(", ")} — ` +
    "version/partialize/migrate must all be present so a stale localStorage blob can always migrate " +
    "forward instead of crashing (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md §13.1/§13.3)."
  );
}

/** The local names this file bound zustand's `persist` EXPORT to — an `ImportSpecifier`'s `getName()` is the
 *  export name even when aliased, so the alias is read off the alias node. The candidate PREFILTER's second
 *  half; fail-closure below never reaches a call outside it. */
function persistAliasesOf(sourceFile: SourceFile): ReadonlySet<string> {
  const names = new Set<string>([PERSIST]);
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.getName() === PERSIST) {
        names.add(specifier.getAliasNode()?.getText() ?? PERSIST);
      }
    }
  }
  return names;
}

/** Is this call zustand's `persist` middleware — under any local name, and FAIL-CLOSED on an unreadable
 *  binding inside the candidate set (`lib/origin-verdict.ts`: prefilter on the name, resolve the identity,
 *  fail closed only inside the candidates). A call this reader can place somewhere OTHER than zustand — a
 *  file-local helper of the same name, a lookalike package — is `other` and is not judged. */
function isPersistCall(node: Node, aliases: ReadonlySet<string>): node is CallExpression {
  if (!TsNode.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (!(TsNode.isIdentifier(callee) && aliases.has(callee.getText()))) {
    return false;
  }
  return readPackageExportOrigin(callee, [ZUSTAND], PERSIST_NAMES).verdict !== "other";
}

/** The options OBJECT behind the options argument — inline, or through the SHARED stable-binding reader. */
function optionsObjectOf(argument: Node): Node | undefined {
  const inline = unwrapExpression(argument);
  if (TsNode.isObjectLiteralExpression(inline)) {
    return inline;
  }
  const resolved = resolveStableExpression(inline);
  const value = resolved.kind === "unresolved" ? inline : unwrapExpression(resolved.value);
  return TsNode.isObjectLiteralExpression(value) ? value : undefined;
}

/** The option keys this options object PROVES are present — its own property names, plus the names behind
 *  every SPREAD the stable reader can resolve to an object literal. A spread the reader REFUSES (a call, a
 *  reassigned binding) contributes NOTHING, which is the fail-closed direction for an accusing arm: a key
 *  nobody can see is not a key that was shown to be there, and the author's answer is the ordinary waiver. */
function presentKeys(object: Node, seen: Set<Node>): ReadonlySet<string> {
  const keys = new Set<string>();
  if (!TsNode.isObjectLiteralExpression(object) || seen.has(object)) {
    return keys;
  }
  seen.add(object);
  for (const property of object.getProperties()) {
    if (TsNode.isSpreadAssignment(property)) {
      const spread = optionsObjectOf(property.getExpression());
      for (const key of spread === undefined ? [] : presentKeys(spread, seen)) {
        keys.add(key);
      }
    } else if (!TsNode.isCommentNode(property)) {
      keys.add(property.getName());
    }
  }
  return keys;
}

export const gate = defineGate({
  id: "persist-partialize-and-total-migrate",
  family: "persist-partialize-and-total-migrate",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: [FACTORY_PERSISTED_STORE, FACTORY_ENTITY_DRAFT_STORE] },
  // `types`, not `syntax`, since #2089: the callee's package-export ORIGIN is what separates zustand's
  // middleware from a file-local helper of the same name, and that is a checker question.
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "add the missing key(s) to the factory's persist() options object. A deliberate site is waived with " +
    "`@orb-waive persist-partialize-and-total-migrate(<position>): <reason>` on the line above, where " +
    "<position> is the `persist(...)` call's own callee text.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node, sourceFile) => {
          if (!isPersistCall(node, persistAliasesOf(sourceFile))) {
            return;
          }
          const argument = node.getArguments()[1];
          const opts = argument === undefined ? undefined : optionsObjectOf(argument);
          if (opts === undefined) {
            return;
          }
          const present = presentKeys(opts, new Set<Node>());
          const missing = REQUIRED_KEYS.filter((key) => !present.has(key));
          if (missing.length === 0) {
            return;
          }
          const callee = node.getExpression();
          ctx.report.node(callee, { token: callee.getText(), offset: 0, message: missingKeysMessage(missing) });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]: 'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), { version: 1 });\n',
      },
      expect: { count: 1, token: PERSIST, messageIncludes: "missing partialize, migrate" },
      why: "the factory's persist options object is missing partialize/migrate (only version present) — the founding shape, now ONE call-site finding naming both absent keys. Carried from `mode: \"source\"` at #2089: the row now imports the real zustand door, because the callee's ORIGIN is what admits it",
    },
    {
      mode: "types",
      files: { ...zustandProof(), [FACTORY_ENTITY_DRAFT_STORE]: 'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), {});\n' },
      expect: { count: 1, token: PERSIST, messageIncludes: "missing version, partialize, migrate" },
      why: "the OTHER factory, all three required keys absent — still ONE finding, so a single waiver can address it",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]: 'import { persist as durable } from "zustand/middleware";\nexport const s = durable(() => ({}), { version: 1 });\n',
      },
      expect: { count: 1, token: "durable", messageIncludes: "missing partialize, migrate" },
      why: 'THE ALIAS RED (#2089). This produced ZERO findings until the callee was read by origin: the surviving arm had kept `Node.isIdentifier(callee) && getText() === "persist"`, the very predicate this module\'s own header retires ARM A for being unable to see through. The token is the ALIAS, because that is the text a position engine finds at the site and therefore the position an author waives',
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]: 'import { persist } from "zustand/middleware";\nconst opts = { version: 1 };\nexport const s = persist(() => ({}), opts);\n',
      },
      expect: { count: 1, token: PERSIST, messageIncludes: "missing partialize, migrate" },
      why: "THE CONST-HOP RED (#2089), zero findings before it: the options object is the entire subject of this policy, and one immutable identifier hop is not a different program. Served by the SHARED stable-binding reader, never a gate-local definition walk",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]: 'import { persist } from "./nowhere-at-all.ts";\nexport const s = persist(() => ({}), { version: 1 });\n',
      },
      expect: { count: 1, token: PERSIST, messageIncludes: "missing partialize, migrate" },
      why: "THE FAIL-CLOSED IDENTITY ARM (#944's third answer, and the per-ARM question §4 makes you answer by RUNNING it): a callee spelled `persist` whose binding the readers cannot place is REPORTED, not acquitted — an options object nobody can place is exactly where a missing `migrate` hides, and this arm ACCUSES, so an unreadable input must not pass. Fail-closure is safe only because it sits behind the NAME PREFILTER: `create(...)` in the same factory is never asked. The trigger is an UNRESOLVABLE IMPORT, not the guide's opaque receiver: an ambient `declare const persist` is a PROVEN non-module binding, which the shared classifier's case (a) passes — measured, it produces 0 findings — so it would have made this row green for the wrong reason",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]:
          'import { persist } from "zustand/middleware";\nfunction makeBase(): Record<string, unknown> {\n  return {};\n}\nexport const s = persist(() => ({}), { ...makeBase() });\n',
      },
      expect: { count: 1, token: PERSIST, messageIncludes: "missing version, partialize, migrate" },
      why: "THE FAIL-CLOSED SPREAD ARM, the same question asked of the OPTIONS half: a spread the stable reader refuses (here a call) contributes no keys, so the guards are UNPROVEN and the call site is reported rather than waved through. This is the direction an accusing arm owes — the opposite answer would let `{ ...buildOptions() }` retire the whole policy in one line — and the ordinary door is the author's answer where the shape is deliberate",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]:
          'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), { version: 1, partialize: (state: unknown) => state, migrate: (state: unknown) => state });\n',
      },
      why: "all three required keys present — the compliant factory shape, and the shape both real factories are in today",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]:
          'import { persist } from "zustand/middleware";\n// @orb-waive persist-partialize-and-total-migrate(persist): probe — the ordinary door must be reachable.\nexport const s = persist(() => ({}), { version: 1 });\n',
      },
      why: "THE #1954 DOOR, and the §4.2 positive identity arm: the correct marker at the reported position (`persist`) suppresses the finding — self-checking, because a dead position, an over-broad match or a stale marker each raise an authority alarm that fails this arm",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_ENTITY_DRAFT_STORE]:
          'import { persist } from "zustand/middleware";\n// @orb-waive persist-partialize-and-total-migrate(persist): probe — one marker reaches an all-keys-absent call site.\nexport const s = persist(() => ({}), {});\n',
      },
      why: "the same door on the all-three-absent shape — the case that was UNWAIVABLE at any marker count before the collapse to one finding per call site",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]:
          "function persist(fn: () => unknown, opts: unknown): unknown {\n  return [fn, opts];\n}\nexport const s = persist(() => ({}), { version: 1 });\n",
      },
      why: "THE IDENTITY NARROWING, pinned in the ACQUITTING direction, and a CLASSIFIED CATCH DELTA (#2089): a file-local helper that happens to be named `persist` is not zustand's middleware, and the options object it takes is nobody's persistence contract. The bare-identifier predicate FLAGGED this — an accusation against code the policy had never identified — which is the same defect as the alias miss seen from the other side. Cutting the origin read open (admitting every candidate-named callee) turns this row red",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...storeLookalikeProof(),
        [FACTORY_PERSISTED_STORE]: 'import { persist } from "store-lookalike";\nexport const s = persist(() => ({}), { version: 1 });\n',
      },
      why: "THE PACKAGE IDENTITY, pinned: a DIFFERENT package exporting the identical name is the strongest same-spelling counterfactual there is — nothing but the resolved origin separates this file from `mustFlag[0]`. Narrowing the package list to something the lookalike matches turns this red",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        [FACTORY_PERSISTED_STORE]:
          'import { persist } from "zustand/middleware";\nconst base = { version: 1, partialize: (state: unknown) => state, migrate: (state: unknown) => state };\nexport const s = persist(() => ({}), { ...base });\n',
      },
      why: "THE READABLE SPREAD, pinned: `{ ...base }` where the stable reader can name `base`'s object literal proves the three keys as surely as spelling them inline, so the compliant factory that hoists its options is not accused. THIS ROW WAS A FALSE POSITIVE BEFORE #2089 — the reader called `getProperty(key)` on the options literal, a `SpreadAssignment` has no such name, and the shape reported all three keys missing (measured: 1 finding). Cutting the spread branch out of `presentKeys` turns it red again, and the sibling `mustFlag` row above pins the UNREADABLE half of the same branch",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        // The IN-POPULATION ANCHOR: without it the `under:` fence admits zero paths and this row comes
        // back a `[population]` TOOL ERROR instead of a pass.
        [FACTORY_PERSISTED_STORE]:
          'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), { version: 1, partialize: (state: unknown) => state, migrate: (state: unknown) => state });\n',
        "packages/client/src/features/x/store.ts": 'import { persist } from "zustand/middleware";\nexport const s = persist(() => ({}), { version: 1 });\n',
      },
      why: "THE POPULATION FENCE, pinned: `mustFlag[0]`'s exact shape OUTSIDE the two mint factories is not this policy's subject — a bare persist anywhere else is `no-raw-zustand-persist`'s arm A, and judging it here would ship a second, weaker gate over one subject. Widening `under:` to the whole client turns this red",
    },
  ],
});
