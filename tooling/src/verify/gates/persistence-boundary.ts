// Policy: persistence-boundary (UI-Theming-and-Content.md §12.1, UI-Gates-and-Lessons.md §11.5) — the
// device-local-vs-synced belt, RAW-STORAGE half. Synced preferences live in the server `user_settings`
// blob; device-local state is minted only through the two persist factories, which force
// version/partialize/migrate. A bare `localStorage` / `sessionStorage` / `indexedDB` in client source is
// the door around both.
//
// AUTHORITY IS reviewed-grant. The legacy `RAW_STORAGE_ALLOWLIST` was six FILES, each with a written
// standing reason: the two factories are the doors themselves, `durable-local.ts` is their shared
// per-user namespace, `probe-mode.ts` is a pre-boot dev flag, `session-resume.ts` is a tab-scoped OIDC
// round trip that cannot ride a store door, and `main.tsx` is the composition root's reload-once guard.
// Every one is a recurring repository PERMISSION rather than a per-occurrence slip, so each is an exact
// `(subject, operation)` row in `lib/reviewed-grants.ts` — keyed on the STORAGE it touches, so a file
// licensed for `sessionStorage` does not silently acquire `localStorage`.
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
// DECLARED LIMIT (its own mustPass row): the analysis program is DOM-less, so a BARE `localStorage` is
// not resolvable precisely and lands on the fail-closed unreadable finding. Still reported — the bare
// spelling is the one the law was written against — but only an ambient-root read gets the precise
// message.
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
      files: { "packages/client/src/features/x/x.ts": 'export const read = (): string | null => localStorage.getItem("k");\n' },
      expect: { count: 1, token: "localStorage" },
      why: "the founding shape — a raw localStorage read in a feature, outside both persistence doors",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/global.ts": 'export const read = (): string | null => globalThis.sessionStorage.getItem("k");\n' },
      expect: { count: 1, token: "sessionStorage" },
      why: "the AMBIENT-ROOT member spelling of the same api — invisible to the legacy bare-identifier check",
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
      why: "a `typeof` CAPABILITY PROBE reads whether the environment has the api at all; it stores nothing",
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
  ],
});
