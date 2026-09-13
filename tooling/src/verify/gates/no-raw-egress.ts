// Policy: no-raw-egress (Core-Path-Registry.md D61 / B5a) — server egress goes through `safeFetch`, the
// self-enforcing SSRF guard (per-request+per-hop scheme pin, a REQUIRED host allowlist,
// resolve→validate→pin against the private-range set, a default deadline, a typed EgressBlockedError).
// A raw `fetch` anywhere in server source is the hole that guard exists to close.
//
// AUTHORITY IS reviewed-grant, and the two `FETCH_SANCTIONED` REGEX ZONES are gone. The exception census
// classifies them as directory PERMISSIONS rather than population, and a regex over a directory is the
// one shape a typed grant cannot be: it licenses every current AND future file under it, which is
// precisely how `imagery/generate-picture.ts` sat inside a sanctioned zone until someone noticed its
// provider-returned URL was response-controlled. Each home that actually performs credentialed or
// loopback egress is now its own `(subject, operation)` row in `lib/reviewed-grants.ts` with `why` and
// `endsWhen`; a file that stops doing raw egress reds at a stale row, and a NEW file in `infra/network`
// or `infra/providers` reds until someone reviews it. That is the two-sided ratchet the legacy
// stale-zone `finalize` arm was hand-rolling, moved to the central table that owns liveness.
//
// IDENTITY, NOT SPELLING. Legacy matched a CallExpression whose callee was an Identifier with the text
// `fetch`, so `globalThis.fetch(url)`, `globalThis["fetch"](url)` and a stored `const f = fetch` alias
// were all invisible. The subject is the ambient global, resolved through `resolveGlobalMemberOrigin`
// and the shared ambient-path reader — which also means the RECEIVER's identity cannot be cast away.
//
// FAIL-CLOSURE IS SCOPED TO THE CANDIDATE SET: only a reference NAMED `fetch` is ever resolved, and only
// a bare reference or one read off an ambient-global root is a subject. A member read off any other
// receiver (`ports.fetch(url)`, `client.fetch(url)`) is NOT A SUBJECT — an injected port is the testable
// shape this law wants, not the hole — and that is a different answer from "unproven innocence".
//
// DECLARED NARROWING (its own mustPass row): a parameter or local named `fetch` provably binds a
// declaration that is not the global, so it passes where the legacy text match reported it.
// DECLARED LIMIT (its own mustPass row): the analysis program is DOM-less, so a bare `fetch(url)` and
// `window.fetch(url)` cannot be resolved PRECISELY; they land on the fail-closed unreadable finding, are
// still reported, and each carries its own row.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readsAmbientGlobalPath } from "../lib/project-home-origin.ts";
import { resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const FETCH = "fetch";
const OPERATION = "raw-fetch";
/** The global objects a browser/node api hangs off. */
const GLOBAL_RECEIVERS: ReadonlySet<string> = new Set(["globalThis", "self", "window"]);

const MESSAGE =
  "a raw `fetch` in server source — route untrusted or user-influenced egress through `safeFetch` " +
  "(infra/network): REQUIRED allowedHosts + scheme pin + resolve→validate→pin + deadline + a typed " +
  "EgressBlockedError, all independent of the EGRESS_FIREWALL toggle. Credentialed and loopback provider " +
  "egress is licensed one FILE at a time by an exact reviewed grant, never by a directory. See " +
  "Core-Path-Registry.md D61 (B5a).";
const UNREADABLE =
  "this reference is spelled like the ambient `fetch` but the shared readers cannot place its binding, so whether it is the network api CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "call `safeFetch` from infra/network with an explicit allowedHosts set (or the declared ANY_HOST escape); a NEW credentialed/loopback egress home needs an exact reviewed grant, never a directory zone.";

/** Could this reference name the global at all? A bare `fetch`, or any member read whose leaf is `fetch`. */
function fetchCandidate(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    return node.getText() === FETCH;
  }
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName() === FETCH;
  }
  if (!Node.isElementAccessExpression(node)) {
    return false;
  }
  const argument = node.getArgumentExpression();
  return argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) && argument.getLiteralText() === FETCH;
}

/** A `typeof globals.fetch === "function"` capability probe reads whether the environment HAS the api, and
 *  a TYPE QUERY (`readonly fetch?: typeof fetch` — the injected-port declaration in the agent-sdk host
 *  token deps, found by this conversion) names the api's TYPE. Neither performs egress: the first is a
 *  guard every one-home writes, the second is how a port declares the shape it accepts. */
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

/** A member read whose ROOT is not one of the ambient global objects is an injected port, not the api. */
function isForeignMemberRead(node: MorphNode): boolean {
  const member = Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node);
  return member && !readsAmbientGlobalPath(node, GLOBAL_RECEIVERS, [FETCH]);
}

type EgressVerdict = "raw" | "other" | "unreadable";

function classify(node: MorphNode): EgressVerdict {
  if (readsAmbientGlobalPath(node, GLOBAL_RECEIVERS, [FETCH])) {
    return "raw";
  }
  if (isForeignMemberRead(node)) {
    return "other";
  }
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    return global.value.globalName === FETCH && global.value.memberPath.length === 0 ? "raw" : "other";
  }
  // An IMPORTED binding named `fetch` is a raw egress door under another roof (a polyfill, `undici`), and
  // legacy reported it as an identifier callee. It stays a finding; the exception is a reviewed row.
  if (resolveModuleMemberOrigin(node).kind === "resolved") {
    return "raw";
  }
  return classifyOriginRefusal(global.reason, node);
}

export const gate = defineGate({
  id: "no-raw-egress",
  family: "no-raw-egress",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate admitted all server source and subtracted two directory zones; the homes are
  // grants now, so nothing is subtracted. `entire-population` because grant liveness is a whole-population
  // verdict.
  population: "@server",
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
            if (!fetchCandidate(node) || isCapabilityProbe(node) || !isExpressionReference(node)) {
              return;
            }
            const verdict = classify(node);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              token: FETCH,
              offset: Math.max(node.getText().lastIndexOf(FETCH), 0),
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
      grant: { subject: "packages/server/src/domain/hub/verbs/browse.ts", operation: "raw-fetch" },
      files: { "packages/server/src/domain/hub/verbs/browse.ts": 'export const load = async (): Promise<unknown> => await fetch("https://x");\n' },
      expect: { count: 1, token: FETCH },
      why: "the founding shape — a bare fetch in an unsanctioned server zone, the SSRF/exfil hole B5a closes",
    },
    {
      mode: "types",
      files: { "packages/server/src/infra/providers/vllm/engine/client.ts": 'export const load = async (): Promise<unknown> => await fetch("https://x");\n' },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a sanctioned provider-egress home reds like any other file and is licensed by an exact grant row, so a SECOND file in that directory is a finding until someone reviews it — which the legacy directory regex could not express",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/verbs/global.ts": 'export const load = async (): Promise<unknown> => await globalThis.fetch("https://x");\n' },
      expect: { count: 1, token: FETCH },
      why: "the AMBIENT-ROOT member spelling of the same api — the legacy identifier-callee check saw nothing here",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/computed.ts": 'export const load = async (): Promise<unknown> => await globalThis["fetch"]("https://x");\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL member spelling — same identity, a third invisible respelling",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/template.ts": 'export const load = async (): Promise<unknown> => await globalThis[`fetch`]("https://x");\n',
      },
      expect: { count: 1 },
      why: 'THE TEMPLATE-LITERAL HALF of the computed spelling, which the `"fetch"` row beside it cannot reach: `fetchCandidate` accepts a StringLiteral OR a NoSubstitutionTemplateLiteral argument, and only this fixture exercises the second disjunct. DIRECTION: dropping `Node.isNoSubstitutionTemplateLiteral(argument)` makes the policy flag LESS — a backtick respelling walks past a D61 egress ban — so the row that dies is a `mustFlag`',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/alias.ts":
          'const call = globalThis.fetch;\nexport const load = async (): Promise<unknown> => await call("https://x");\n',
      },
      expect: { count: 1 },
      why: "A STORED ALIAS of the global is the same egress one binding away; the DECLARATION is the read the policy sees",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/cast.ts":
          'const globals = globalThis as { fetch?: (url: string) => Promise<unknown> };\nexport const load = async (): Promise<unknown> => await globals.fetch?.("https://x");\n',
      },
      expect: { count: 1 },
      why: "THE CAST DODGE: a structural cast of `globalThis` gives the property symbol a declaration in the CAST'S OWN type literal, which a member-axis read calls a different identity. The RECEIVER cannot be cast away, and that is what the verdict asks",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/hub/verbs/bare.ts": 'export const load = async (): Promise<unknown> => await fetch("https://x");\n' },
      expect: { count: 1 },
      why: "THE HONEST LIMIT, pinned: the analysis program is DOM-less, so a BARE `fetch` is not resolvable precisely and lands on the fail-closed unreadable finding. Reported either way — which is what this row holds — but only an ambient-root spelling gets the precise message",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/infra/network/egress.ts":
          "export declare function safeFetch(url: string, options: { allowedHosts: readonly string[] }): Promise<unknown>;\n",
        "packages/server/src/domain/hub/verbs/browse.ts":
          'import { safeFetch } from "../../../infra/network/egress.ts";\nexport const load = async (): Promise<unknown> => await safeFetch("https://x", { allowedHosts: [] });\n',
      },
      why: "the fix: the verb routes through the guard and never touches the api",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/port.ts":
          'export const load = async (ports: { fetch: (url: string) => Promise<unknown> }): Promise<unknown> => await ports.fetch("https://x");\n',
      },
      why: "AN INJECTED PORT IS NOT A SUBJECT: a member read whose root is not an ambient global is the testable shape this law wants. Fail-closure belongs to the bare/ambient arm, and applying it here would accuse every `deps.fetch` in the tree",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/param.ts":
          'export const load = async (fetch: (url: string) => Promise<unknown>): Promise<unknown> => await fetch("https://x");\n',
      },
      why: "THE DECLARED NARROWING: a PARAMETER named `fetch` provably binds a non-module declaration, so it shadows the global — the legacy text match reported it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/probe.ts":
          'export const has = (globals: { fetch?: (url: string) => Promise<unknown> }): boolean => typeof globals.fetch === "function";\n',
      },
      why: "a bare `typeof` CAPABILITY PROBE reads whether the environment has the api at all; it performs no egress",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/backends/agent-sdk/host-token.ts":
          "export interface HostTokenDeps {\n  readonly fetch?: typeof fetch;\n}\nexport const deps: HostTokenDeps = {};\n",
      },
      why: "A TYPE QUERY IS NOT A CALL, and this is the live shape that proved it: `agent-sdk/host-token.ts` declares its injected port as `readonly fetch?: typeof fetch`. Widening the subject from the legacy identifier-CALLEE to every reference named `fetch` picked it up as a raw-egress finding on the first real pass — a port DECLARATION is the fix this law wants, not the hole",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/verbs/method.ts":
          "class Loader {\n  fetch(url: string): string {\n    return url;\n  }\n  run(): string {\n    return this.fetch('https://x');\n  }\n}\nexport const loader = new Loader();\n",
      },
      why: "SAME NAME, LOCAL METHOD: a project class with a `fetch` method is a proven different binding, and the legacy name check never saw it because the callee was not a bare identifier",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/load.ts": 'export const load = async (): Promise<unknown> => await globalThis.fetch("https://x");\n',
        "packages/server/src/domain/hub/verbs/anchor.ts": "export const noop = (): void => undefined;\n",
      },
      why: 'THE POPULATION FENCE (`population: "@server"`), which nothing exercised: this law is about SERVER egress — the browser has no `safeFetch` and no SSRF surface to close — so the byte-identical ambient-root call that `mustFlag[2]` reports is NOT a finding in client source. Widen the root and this row flags. The clean server file is the ANCHOR the fence needs: a falsifier holding only the out-of-population file admits zero paths and comes back a `[population]` TOOL ERROR, which proves nothing',
    },
  ],
});
