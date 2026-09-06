// Policy: no-raw-zustand-persist (UI-Gates-and-Lessons.md §11.5) — three arms of ONE law: the persistence
// footguns are baked into the two store factories and nothing else may spell them.
//
//   A — a bare `persist(` outside the factories re-grows partialize / version+total-migrate / key uniqueness.
//   B — `setState(store.getInitialState(), true)` on a persist-minted store is NOT an in-memory drop (#879,
//       from #837): zustand's `persist` patches `setState` to write through, so the reset OVERWRITES the
//       durable blob with defaults and the next `rehydrate()` reads the emptied one back. That made every
//       `orb:*` blob app-wide inert on every boot. It is legal only inside the two mint factories, whose
//       `reset` closures the durable-local registry drives through `resetWithoutPersisting`.
//   C — the seam that makes B total: inside the durable-local REGISTRY, a registered store's `reset()` may
//       only be called from a function that installs the storage blindfold (`persist.setOptions({storage})`).
//       A third caller elsewhere in that file drops a store WITHOUT the blindfold, which is #837 one layer up.
//
// AUTHORITY IS reviewed-grant. The two factories are recurring repository PERMISSIONS for arms A and B, as
// exact `(subject, operation)` rows in `lib/reviewed-grants.ts`. That single table also replaces the
// module's own two-sided staleness sweep: a factory that MOVED and a factory that stopped calling `persist(`
// are the same thing to central reconciliation — zero consumption, STALE — and the sweep's third arm (the
// §4.6 blindness tripwire for arm C) becomes a RECEIPT REFUSAL, which is what a policy that cannot find its
// subject owes.
//
// IDENTITY, NOT SPELLING, on every arm. `persist` was `getExpression().getText() === "persist"`, so a local
// helper of that name red and an aliased import walked past; `setState`/`getInitialState` were method NAMES
// on any receiver; `reset`/`setOptions` were method names inside a file found by `getFunction(...)`. The
// subjects are now zustand's own declarations, the registry's own `RegisteredStore.reset`, and the registry's
// own `setOptions` — and the registry file is still located by the DECLARATION it exports, never by a path
// constant, which is the legacy module's own recorded ruling.
//
// ARM B ALSO ASKS THE UNCAST RECEIVER. A cast declares `setState`/`getInitialState` in its own type literal
// (`raw as unknown as { setState: …; getInitialState: … }`), which the property-symbol reader reads as a
// proven different identity — so the #837 shape could be written past this policy in one line. The store
// behind the cast is still zustand's; the shared reader (`lib/project-home-origin.ts`) judges both axes.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyPackageMemberOrigin, readPackageExportOrigin } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { declaredByFile, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { storeLookalikeProof, zustandProof } from "./_proof/zustand.ts";

const ZUSTAND = "zustand";
const PERSIST = "persist";
const SET_STATE = "setState";
const GET_INITIAL_STATE = "getInitialState";
const RESET = "reset";
const SET_OPTIONS = "setOptions";
/** The registry is found by the function it DECLARES, never by a path constant — the legacy module's own
 *  ruling, kept: a path pin dies on a rename while an exported declaration is the thing being fenced. */
const REGISTRY_DECL = "registerDurableLocalStore";
const PERSIST_NAMES: ReadonlySet<string> = new Set([PERSIST]);

const OPERATIONS = {
  persistMint: "zustand-persist-mint",
  destructiveReset: "destructive-store-reset",
  unblindfoldedReset: "unblindfolded-registered-reset",
} as const;

const MESSAGE =
  "raw zustand persistence outside its sealed homes — the footguns (partialize / version+total-migrate / key " +
  "uniqueness) are baked into `createEntityDraftStore` / `createPersistedStore`; a destructive " +
  "`setState(store.getInitialState(), true)` on a persist-minted store writes the emptied state THROUGH to " +
  "durable storage (#879, from #837), so it belongs to those same factories; and inside the durable-local " +
  "registry a registered store's `reset()` may only run behind the storage blindfold. See " +
  "UI-Gates-and-Lessons.md §11.5.";
const UNREADABLE =
  "this expression is spelled like zustand's persistence api but the shared readers cannot place its binding, so whether it is the middleware CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "use createEntityDraftStore / createPersistedStore instead of a bare persist(); drop a store through the durable-local door (`resetWithoutPersisting`), which blindfolds the storage first.";

interface Ranged {
  readonly start: number;
  readonly end: number;
  readonly file: object;
}

function ranged(node: MorphNode): Ranged {
  return { start: node.getStart(), end: node.getEnd(), file: node.getSourceFile().compilerNode };
}

function contains(outer: Ranged, inner: Ranged): boolean {
  return outer.file === inner.file && outer.start <= inner.start && inner.end <= outer.end;
}

/** The member name a callee reads, across dotted and computed-literal spellings. */
function memberName(callee: MorphNode): string | null {
  let name: string | null = null;
  if (Node.isPropertyAccessExpression(callee)) {
    name = callee.getName();
  }
  if (Node.isElementAccessExpression(callee)) {
    const argument = callee.getArgumentExpression();
    const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    name = literal ? argument.getLiteralText() : null;
  }
  return name;
}

/** ARM B's shape: `<store>.setState(<store>.getInitialState(), true)`. `true` is zustand's REPLACE flag —
 *  without it the call is an ordinary merge and not this defect. */
function destructiveResetArgument(call: MorphNode): MorphNode | null {
  if (!Node.isCallExpression(call)) {
    return null;
  }
  const [first, second] = call.getArguments();
  if (second?.getKind() !== SyntaxKind.TrueKeyword || first === undefined || !Node.isCallExpression(first)) {
    return null;
  }
  const inner = first.getExpression();
  return memberName(inner) === GET_INITIAL_STATE ? inner : null;
}

/** The enclosing function body of a call, for ARM C's blindfold question. Ancestors only — a policy owns no
 *  descendant traversal, so the `setOptions` calls that answer it come from the shared walk instead. */
function enclosingBody(call: MorphNode): MorphNode | null {
  let body: MorphNode | null = null;
  for (const ancestor of call.getAncestors()) {
    const callable =
      Node.isFunctionDeclaration(ancestor) || Node.isMethodDeclaration(ancestor) || Node.isFunctionExpression(ancestor) || Node.isArrowFunction(ancestor);
    if (body === null && callable) {
      body = ancestor.getBody() ?? null;
    }
  }
  return body;
}

interface Found {
  readonly node: MorphNode;
  readonly subject: string;
  readonly operation: string;
  readonly token: string;
  readonly unreadable: boolean;
}

/** ARM A: is this callee zustand's `persist` middleware? The reported TOKEN is the spelling at the site —
 *  an aliased import is anchored on the alias, because that is the text a position engine finds there. */
function persistCandidate(callee: MorphNode, subject: string, spelling: string): Found | null {
  const { verdict } = readPackageExportOrigin(callee, [ZUSTAND], PERSIST_NAMES);
  return verdict === "other" ? null : { node: callee, subject, operation: OPERATIONS.persistMint, token: spelling, unreadable: verdict === "unreadable" };
}

/** ARM B: is this the destructive persist-through reset on a zustand store api? */
function destructiveCandidate(call: MorphNode, callee: MorphNode, subject: string): Found | null {
  const inner = destructiveResetArgument(call);
  if (inner === null) {
    return null;
  }
  const verdict = classifyPackageMemberOrigin(callee, [ZUSTAND]);
  return verdict === "other"
    ? null
    : { node: inner, subject, operation: OPERATIONS.destructiveReset, token: GET_INITIAL_STATE, unreadable: verdict === "unreadable" };
}

interface CallSite {
  readonly subject: string;
  readonly source: SourceFile;
}

interface CallSinks {
  readonly push: (found: Found | null) => void;
  readonly blindfolds: Ranged[];
  readonly resets: ResetSite[];
  /** Local names this file bound the `persist` middleware to at an import specifier — the alias half of the
   *  candidate prefilter, since an ImportSpecifier's `getName()` is the EXPORT name even when aliased. */
  readonly persistAliases: ReadonlySet<string>;
}

/** One call, routed to whichever arm its callee name could belong to. The name filter is the CANDIDATE
 *  PREFILTER — resolving an origin for every call in the client tree does not finish — and every arm still
 *  proves identity before it reports. */
function visitCall(call: MorphNode, site: CallSite, sinks: CallSinks): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  const name = memberName(callee) ?? (Node.isIdentifier(callee) ? callee.getText() : null);
  if (name !== null && (name === PERSIST || sinks.persistAliases.has(name))) {
    sinks.push(persistCandidate(callee, site.subject, name));
    return;
  }
  if (name === SET_STATE) {
    sinks.push(destructiveCandidate(call, callee, site.subject));
    return;
  }
  if (name === SET_OPTIONS) {
    sinks.blindfolds.push(ranged(call));
    return;
  }
  if (name === RESET) {
    const body = enclosingBody(call);
    sinks.resets.push({ node: callee, subject: site.subject, body: body === null ? null : ranged(body), source: site.source });
  }
}

interface ResetSite {
  readonly node: MorphNode;
  readonly subject: string;
  readonly body: Ranged | null;
  readonly source: SourceFile;
}

/** ARM C: a registered store's `reset()` inside the registry, not behind the storage blindfold. The
 *  registered identity is the `reset` member DECLARED BY the registry file itself — its `RegisteredStore`
 *  is file-private, which is exactly what makes that file the whole reachable surface. */
function unblindfoldedReset(reset: ResetSite, registryFiles: ReadonlySet<object>, blindfolds: readonly Ranged[]): Found | null {
  if (!registryFiles.has(reset.source.compilerNode)) {
    return null;
  }
  const origin = resolveTypeMemberOrigin(reset.node);
  if (!(origin.kind === "resolved" && declaredByFile(origin.value.declarations, reset.source))) {
    return null;
  }
  const body = reset.body;
  if (body !== null && blindfolds.some((installed) => contains(body, installed))) {
    return null;
  }
  return { node: reset.node, subject: reset.subject, operation: OPERATIONS.unblindfoldedReset, token: RESET, unreadable: false };
}

const REGISTRY_PROOF = {
  "packages/client/src/state/durable-local.ts": [
    "interface RegisteredStore {",
    "  readonly api: { readonly persist?: { readonly setOptions: (options: unknown) => void } };",
    "  readonly reset: () => void;",
    "}",
    "const registry: RegisteredStore[] = [];",
    "export function registerDurableLocalStore(entry: RegisteredStore): void {",
    "  registry.push(entry);",
    "}",
    "function resetWithoutPersisting(entry: RegisteredStore): void {",
    "  entry.api.persist?.setOptions({});",
    "  entry.reset();",
    "}",
    "export function resetAll(): void {",
    "  for (const entry of registry) {",
    "    resetWithoutPersisting(entry);",
    "  }",
    "}",
    "",
  ].join("\n"),
};

export const gate = defineGate({
  id: "no-raw-zustand-persist",
  family: "no-raw-zustand-persist",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate was client sources minus `*.test.tsx?`; the factory homes are grants now, so
  // nothing is subtracted for them.
  population: { in: ["@client"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    const resets: { readonly node: MorphNode; readonly subject: string; readonly body: Ranged | null; readonly source: SourceFile }[] = [];
    const blindfolds: Ranged[] = [];
    const registries: SourceFile[] = [];
    const persistAliasesBySource = new Map<string, Set<string>>();
    const persistAliasesOf = (sourceFile: SourceFile): Set<string> => {
      const path = sourceFile.getFilePath();
      let names = persistAliasesBySource.get(path);
      if (names === undefined) {
        names = new Set<string>();
        persistAliasesBySource.set(path, names);
      }
      return names;
    };

    const push = (found: Found | null): void => {
      if (found === null) {
        return;
      }
      candidates.push({
        node: found.node,
        subject: found.subject,
        operation: found.operation,
        unreadable: found.unreadable,
        token: found.token,
        offset: Math.max(found.node.getText().lastIndexOf(found.token), 0),
      });
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile): void => {
            if (Node.isImportSpecifier(node) && node.getName() === PERSIST) {
              persistAliasesOf(sourceFile).add(node.getAliasNode()?.getText() ?? PERSIST);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (Node.isCallExpression(node)) {
              visitCall(
                node,
                { subject: ctx.relativePath(sourceFile), source: sourceFile },
                { push, blindfolds, resets, persistAliases: persistAliasesOf(sourceFile) },
              );
            }
          },
        },
      ],
      visitFile: (sourceFile): void => {
        // DECLARES, not merely re-exports: the state barrel forwards `registerDurableLocalStore` too, and a
        // barrel is not the registry — ARM C's subject is the file whose file-private `RegisteredStore` makes
        // it the whole reachable surface.
        const declares = sourceFile.getExportSymbols().some((symbol) => {
          if (symbol.getName() !== REGISTRY_DECL) {
            return false;
          }
          const declarations = (symbol.getAliasedSymbol() ?? symbol).getDeclarations();
          return declarations.length > 0 && declarations.every((declaration) => declaration.getSourceFile().compilerNode === sourceFile.compilerNode);
        });
        if (declares) {
          registries.push(sourceFile);
        }
      },
      evaluate: (): void => {
        // ZERO members is a REFUSAL, and it is the legacy §4.6 blindness tripwire in its final form: no file
        // declares the durable-local registry any more, so ARM C judged nothing and a green here would be a
        // placebo.
        ctx.receipt({ kind: "population", source: REGISTRY_DECL, members: registries.length, unresolved: 0 });
        const registryFiles = new Set(registries.map((file) => file.compilerNode));
        for (const reset of resets) {
          push(unblindfoldedReset(reset, registryFiles, blindfolds));
        }
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/store.ts":
          'import { create } from "zustand";\nimport { persist } from "zustand/middleware";\nexport const useStore = create(persist(() => ({})));\n',
      },
      expect: { count: 1, token: PERSIST },
      why: "ARM A, the founding shape — a bare persist() outside the two factories",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/state/create-persisted-store.ts":
          'import { create } from "zustand";\nimport { persist } from "zustand/middleware";\nexport const useStore = create(persist(() => ({})));\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the factory's own persist call reds like any other and is licensed by an exact grant row — and a row that stops matching (the factory moved, or stopped persisting) is STALE, which is both legacy staleness modes in one mechanism",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/reset.ts":
          'import { create } from "zustand";\nconst store = create<{ a: number }>(() => ({ a: 1 }));\nexport function wipe(): void {\n  store.setState(store.getInitialState(), true);\n}\n',
      },
      expect: { count: 1, token: GET_INITIAL_STATE },
      why: "ARM B, THE #837 RED: a destructive persist-through reset outside the mint factories — `persist` patches `setState`, so this writes the emptied state to the store's real key",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/aliased.ts":
          'import { create } from "zustand";\nimport { persist as durable } from "zustand/middleware";\nexport const useStore = create(durable(() => ({})));\n',
      },
      expect: { count: 1 },
      why: 'THE ALIAS RED on arm A: the middleware under another local name is the same middleware, and the legacy `getText() === "persist"` check was offered `durable`',
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        "packages/client/src/state/durable-local.ts": [
          "interface RegisteredStore {",
          "  readonly api: { readonly persist?: { readonly setOptions: (options: unknown) => void } };",
          "  readonly reset: () => void;",
          "}",
          "const registry: RegisteredStore[] = [];",
          "export function registerDurableLocalStore(entry: RegisteredStore): void {",
          "  registry.push(entry);",
          "}",
          "function resetWithoutPersisting(entry: RegisteredStore): void {",
          "  entry.api.persist?.setOptions({});",
          "  entry.reset();",
          "}",
          "export function forget(entry: RegisteredStore): void {",
          "  entry.reset();",
          "}",
          "",
        ].join("\n"),
      },
      expect: { count: 1, token: RESET },
      why: "ARM C: a SECOND caller of a registered store's `reset()` inside the registry, outside the function that installs the storage blindfold — #837 one layer up. The blindfolded caller in the same file passes, so the arm is not merely counting `reset()` calls",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/cast-reset.ts":
          'import { create } from "zustand";\nconst raw = create<{ a: number }>(() => ({ a: 1 }));\nconst gStore = raw as unknown as { setState: (state: unknown, replace: boolean) => void; getInitialState: () => unknown };\nexport function wipe(): void {\n  gStore.setState(gStore.getInitialState(), true);\n}\n',
      },
      expect: { count: 1, token: GET_INITIAL_STATE },
      why: "THE CAST DODGE on ARM B: the cast declares both methods in its own type literal, so the property-symbol reader called it a different identity and the #837 persist-through reset PASSED while the uncast twin reported. The store behind the cast is still zustand's",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/store.ts":
          'import { createPersistedStore } from "../../state/create-persisted-store.ts";\nexport const useStore = createPersistedStore("x");\n',
        "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string): unknown;\n",
      },
      why: "the fix: a feature store minted through the factory spells no vendor persistence at all",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/local.ts": "function persist<T>(value: T): T {\n  return value;\n}\nexport const wrapped = persist({ a: 1 });\n",
      },
      why: "A LOCAL FUNCTION named `persist` is a proven different identity — the legacy TEXT check red exactly this",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...storeLookalikeProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/vendor.ts":
          'import { create, persist } from "store-lookalike";\nexport const useStore = create(persist(() => ({})));\n',
      },
      why: "SAME NAMES, WRONG PACKAGE: another store library's `persist` and store api are not zustand's, and only the declaring package can say so",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/merge.ts":
          'import { create } from "zustand";\nconst store = create<{ a: number }>(() => ({ a: 1 }));\nexport function soft(): void {\n  store.setState(store.getInitialState());\n}\n',
      },
      why: "ARM B's NARROWING: without zustand's REPLACE flag the call is an ordinary merge, not a destructive persist-through reset",
    },
    {
      mode: "types",
      files: {
        ...zustandProof(),
        ...REGISTRY_PROOF,
        "packages/client/src/features/x/other-reset.ts":
          "interface Thing {\n  readonly reset: () => void;\n}\nexport function drop(thing: Thing): void {\n  thing.reset();\n}\n",
      },
      why: "ARM C's SCOPE: a `reset()` on some other object OUTSIDE the registry file is not the registered-store drop — the arm's subject is the registry's own `RegisteredStore.reset`, in the registry's own file",
    },
  ],
});
