// Policy: persistence-boundary (UI-Theming-and-Content.md §12.1, UI-Gates-and-Lessons.md §11.5) — the
// device-local-vs-synced belt, RAW-STORAGE half. Synced preferences live in the server `user_settings`
// blob; device-local state is minted only through the two persist factories, which force
// version/partialize/migrate. A bare `localStorage` / `sessionStorage` / `indexedDB` in client source is
// the door around both.
//
// AUTHORITY IS reviewed-grant, AND THE SIX LEGACY FILES BECAME FOUR ROWS — the two-file difference is the
// identity reader doing its job, not a dropped permission. The legacy `RAW_STORAGE_ALLOWLIST` named six
// files because it was a TEXT scan: `createPersistedStore` and `createEntityDraftStore` spell
// `localStorage` only in JSDoc, a header sentence and a duplicate-name error string, and they reach the
// api exclusively through `durable-local.ts`'s helpers. A comment and a string are not references, so the
// two factories produce NO candidate here and need NO grant; a row for them would be an over-broad licence
// matching nothing, which central reconciliation would stale. The four homes that DO read the api —
// `durable-local.ts` (the shared per-user namespace pointer), `probe-mode.ts` (a pre-boot dev flag),
// `session-resume.ts` (a tab-scoped OIDC round trip that cannot ride a store door) and `main.tsx` (the
// composition root's reload-once guard) — are each a recurring repository PERMISSION rather than a
// per-occurrence slip, so each is an exact `(subject, operation)` row in `lib/reviewed-grants.ts`, keyed
// on the STORAGE it touches so a file licensed for `sessionStorage` does not silently acquire
// `localStorage`. Four is therefore the correct count and the roster row that says four is correct.
//
// THE REGISTRY HALF IS ITS OWN POLICY. `DEVICE_LOCAL_REGISTRY` is not an exception table at all — the
// exception census classifies it as authoritative data (which persisted-store names the tree has decided
// are legitimately device-local), and its arms are HARD. It is `persisted-store-registry`, same family;
// one descriptor cannot carry two authorities.
//
// IDENTITY, NOT SPELLING. Legacy matched an Identifier whose text was one of the three api names, so a
// `globalThis.localStorage`, a `globalThis["localStorage"]` and a stored alias were invisible, while any
// project object with a `localStorage` property would have matched had it been spelled bare. The subject
// is the ambient global, resolved through the shared readers; a member read off any other receiver is NOT
// A SUBJECT (an injected storage port is the testable shape), which is a different answer from "unproven".
//
// THE FAIL-CLOSED THIRD ANSWER, AND WHAT ACTUALLY REACHES IT (measured 2026-09-12; the previous paragraph
// here claimed a BARE `localStorage` lands on the unreadable finding because the analysis program is
// DOM-less, and that is FALSE). An UNDECLARED free identifier resolves through `resolveGlobalMemberOrigin`
// as the ambient global of that name with an empty member path, so the bare spelling — the one the law was
// written against — takes the `"raw"` verdict and the PRECISE message, exactly like the ambient-root
// member spelling. What reaches `"unreadable"` is a binding the readers cannot place at all: an AMBIGUOUS
// refusal (`write` / `cycle` / `ambiguous`), of which the live shape is a mutable `let localStorage` that
// is assigned somewhere — a local declaration that still might hold the api, which is why silence would be
// wrong. `mustFlag[6]` is that row.
//
// THE SPLIT IS PINNED, not asserted. `MESSAGE` and `UNREADABLE` share no substring, and the two arms
// report the SAME finding count, so a row carrying only `count` passes identically whichever arm fired.
// `mustFlag[0]`/`[1]` carry a `messageIncludes` naming the precise text and `mustFlag[6]` one naming the
// unreadable text; without them the third answer is advertised prose over unreached code (#1990). Probe:
// replace the refusal branch's return with a `throw` and run these rows — before `mustFlag[6]` existed the
// branch was reached only by two `mustPass` fixtures, and it answered `"other"` in both.
//
// THE THREE `classify` CLAUSES ARE A NESTED CLUSTER, NOT THREE INDEPENDENT FENCES — the full 2^3 cut
// matrix, measured 2026-09-12 against the rows below (a single-cut sweep reads all three as clean gaps and
// is wrong about two of them):
//   `classifyOriginRefusal` is INDIVIDUALLY ENFORCED. Fail it open (return `"unreadable"` unconditionally)
//     and `mustPass[2]` (a class METHOD named `localStorage`) and `mustPass[3]` (a PARAMETER shadowing the
//     global) both red. It is the clause that keeps a proven foreign binding silent.
//   The member-read→`"other"` rule is enforced ONLY ONCE the refusal classifier is already open: cut alone,
//     every row stays green; cut WITH the classifier, `mustPass[0]` (the injected storage port) joins them.
//   `isCapabilityProbe` is enforced ONLY in the TRIPLE: cut with either sibling the rows hold, and
//     `mustPass[1]` (the `typeof` probe) reds only when all three are open. It is genuinely last in line —
//     the member rule answers its subject first — which is why `mustPass[1]`'s `why` says so rather than
//     claiming to exercise the predicate.
//   UNFALSIFIABLE — `memberPath.length === 0` at the resolved-global branch. That branch is reached only
//     for a NON-member node, where `memberPath` is empty by construction, so no fixture can make the test
//     decide anything. It stays because it is the shared reader's contract, and no row claims to prove it
//     (§4.1's fourth outcome: record the gap, never fake a pin).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readsAmbientGlobalPath } from "../lib/project-home-origin.ts";
import { resolveGlobalMemberOrigin } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

/** The three raw browser stores the belt is about. */
const STORAGE_NAMES: readonly string[] = ["localStorage", "sessionStorage", "indexedDB"];
const GLOBAL_RECEIVERS: ReadonlySet<string> = new Set(["globalThis", "self", "window"]);

const MESSAGE =
  "raw browser storage outside the persistence doors (UI-Theming-and-Content.md §12.1): synced " +
  "preferences belong in the server `user_settings` blob, and device-local state is minted through " +
  "`createPersistedStore` / `createEntityDraftStore`, which force version/partialize/migrate. A boot or " +
  "dev-tooling home that must touch the api directly takes an exact reviewed grant naming the store.";
const UNREADABLE =
  "this reference is spelled like a raw browser store but the shared readers cannot place its binding, so whether it is the storage api CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "mint the state through createPersistedStore/createEntityDraftStore, or home the preference in the synced user_settings blob; a boot/dev-tooling home takes an exact reviewed grant.";

/** The store this reference could name — a bare identifier, or any member read whose leaf is one. */
function storageCandidateName(node: MorphNode): string | undefined {
  if (Node.isIdentifier(node)) {
    return STORAGE_NAMES.find((name) => name === node.getText());
  }
  if (Node.isPropertyAccessExpression(node)) {
    return STORAGE_NAMES.find((name) => name === node.getName());
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) ? argument.getLiteralText() : "";
  return STORAGE_NAMES.find((name) => name === literal);
}

/** A `typeof globals.localStorage` capability probe, or a TYPE QUERY naming the api's type, is not a use. */
function isCapabilityProbe(node: MorphNode): boolean {
  const parent = node.getParent();
  return Node.isTypeOfExpression(parent) || Node.isTypeQuery(parent);
}

/** An identifier that merely NAMES the member in a property position is not a reference to the global. */
function isExpressionReference(node: MorphNode): boolean {
  const parent = node.getParent();
  const named = Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node;
  return !(named || Node.isPropertySignature(parent) || Node.isPropertyAssignment(parent) || Node.isMethodSignature(parent));
}

type StorageVerdict = "raw" | "other" | "unreadable";

function classify(node: MorphNode, name: string): StorageVerdict {
  if (readsAmbientGlobalPath(node, GLOBAL_RECEIVERS, [name])) {
    return "raw";
  }
  const member = Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node);
  if (member) {
    // A member read whose ROOT is not an ambient global is an injected storage port, not the api.
    return "other";
  }
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    return global.value.globalName === name && global.value.memberPath.length === 0 ? "raw" : "other";
  }
  return classifyOriginRefusal(global.reason, node);
}

export const gate = defineGate({
  id: "persistence-boundary",
  family: "persistence-boundary",
  authority: "reviewed-grant",
  severity: "error",
  // Legacy scanned all client source and subtracted six files; those files are grants now, so nothing is
  // subtracted. `entire-population` because grant liveness is a whole-population verdict.
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile): void => {
            const name = storageCandidateName(node);
            if (name === undefined || isCapabilityProbe(node) || !isExpressionReference(node)) {
              return;
            }
            const verdict = classify(node, name);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: `raw-storage:${name}`,
              unreadable: verdict === "unreadable",
              token: name,
              offset: Math.max(node.getText().lastIndexOf(name), 0),
            });
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/features/x/x.ts", operation: "raw-storage:localStorage" },
      files: { "packages/client/src/features/x/x.ts": 'export const read = (): string | null => localStorage.getItem("k");\n' },
      expect: { count: 1, token: "localStorage", messageIncludes: "outside the persistence doors" },
      why: "the founding shape — a raw localStorage read in a feature, outside both persistence doors. The `messageIncludes` pins WHICH ARM answers: an undeclared free identifier resolves as the ambient global, so the bare spelling takes the PRECISE verdict, not the fail-closed one. Measured, because the count alone cannot tell the two arms apart and this module's header used to claim the opposite",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/global.ts": 'export const read = (): string | null => globalThis.sessionStorage.getItem("k");\n' },
      expect: { count: 1, token: "sessionStorage", messageIncludes: "outside the persistence doors" },
      why: "the AMBIENT-ROOT member spelling of the same api — invisible to the legacy bare-identifier check. The `messageIncludes` names the PRECISE verdict's text, which the unreadable text does not contain: this is the arm the header promises an ambient-root read reaches, and it is the twin of `mustFlag[0]`'s pin",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/computed.ts": 'export const read = (): string | null => globalThis["localStorage"].getItem("k");\n' },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL member spelling — a third respelling of one identity",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/cast.ts":
          "const globals = globalThis as { indexedDB?: { open: (name: string) => unknown } };\nexport const open = (): unknown => globals.indexedDB?.open('db');\n",
      },
      expect: { count: 1 },
      why: "THE CAST DODGE: a structural cast of `globalThis` moves the property symbol into the cast's own type literal, which a member-axis read calls a different identity. The receiver cannot be cast away",
    },
    {
      mode: "types",
      files: { "packages/client/src/state/durable-local.ts": 'export const read = (): string | null => localStorage.getItem("orb.user");\n' },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a licensed boot home reds like any other file and is licensed by its exact grant row, so a SECOND raw-storage touch in that file — or a new file beside it — is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/quasi.ts": "export const read = (): string | null => globalThis[`localStorage`].getItem('k');\n" },
      expect: { count: 1, messageIncludes: "outside the persistence doors" },
      why: "THE BACKTICK COMPUTED SPELLING: an element access whose argument is a `NoSubstitutionTemplateLiteral` rather than a `StringLiteral`. `storageCandidateName` reads both literal kinds; before this row only the quoted half was exercised, so dropping the template arm was a clean cut. Drop `Node.isNoSubstitutionTemplateLiteral(argument)` and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/written.ts":
          "let localStorage: { getItem: (key: string) => string | null } = { getItem: () => null };\nexport const bind = (store: { getItem: (key: string) => string | null }): void => {\n  localStorage = store;\n};\nexport const read = (): string | null => localStorage.getItem('k');\n",
      },
      expect: { count: 1, messageIncludes: "cannot place its binding" },
      why: "THE FAIL-CLOSED THIRD ANSWER, and the only row that reaches it. A WRITTEN binding refuses as `write`, which `classifyOriginRefusal` never lets a proven-local declaration silence — `let localStorage = globalThis.localStorage` is a local declaration that still holds the api. The `messageIncludes` is load-bearing: the unreadable arm reports the same COUNT as the precise arm and differs only in message, so `count` alone would pass whether or not the arm ever fires",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/port.ts":
          'export const read = (ports: { localStorage: { getItem: (key: string) => string | null } }): string | null => ports.localStorage.getItem("k");\n',
      },
      why: "AN INJECTED PORT IS NOT A SUBJECT: a member read whose root is not an ambient global is the testable shape. Fail-closure belongs to the bare/ambient arm; applying it here would accuse every `deps.localStorage` in the tree",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/probe.ts":
          'export const has = (globals: { localStorage?: unknown }): boolean => typeof globals.localStorage === "object";\n',
      },
      why: 'a `typeof` CAPABILITY PROBE reads whether the environment has the api at all; it stores nothing. THE ROW DOES NOT ISOLATE `isCapabilityProbe`: measured 2026-09-12, this row reds only when `isCapabilityProbe`, the member-read rule AND `classifyOriginRefusal` are ALL open, because `globals.localStorage` is a member read off a non-ambient root and `classify` answers `"other"` before the probe test is consulted. The row states the RULE; the header\'s cut matrix states which cuts actually kill it',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/local.ts":
          "class Cache {\n  localStorage(key: string): string {\n    return key;\n  }\n  run(): string {\n    return this.localStorage('k');\n  }\n}\nexport const cache = new Cache();\n",
      },
      why: "SAME NAME, LOCAL METHOD: a project class with a `localStorage` method is a proven different binding",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/shadow.ts":
          "export const read = (localStorage: { getItem: (key: string) => string | null }): string | null => localStorage.getItem('k');\n",
      },
      why: "A PARAMETER named `localStorage` shadows the global — an injected store is the testable shape, not a fork of the api",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/store.ts": 'export const read = (): string | null => globalThis.localStorage.getItem("k");\n',
      },
      why: "THE POPULATION FENCE: the ambient-root read of `mustFlag[1]`, moved to `@server`, produces nothing — the device-local-vs-synced belt is a CLIENT law, and server-side storage is a different question with a different answer. The client anchor is load-bearing: a fixture holding only the server file admits zero paths and the run comes back a `[population]` TOOL ERROR rather than a finding. Widen `population` to `@authored` and this is the row that dies",
    },
  ],
});
