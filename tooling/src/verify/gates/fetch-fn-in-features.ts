// A client feature must NEVER hand-write a global `fetch(` call. HTTP-route egress (multipart/binary/
// streaming — anything not tRPC) gets ONE `data/` fetch fn each (upload-asset, import-tree, the auth-session
// me/login/logout seam), sharing http-error.ts + the CSRF_HEADER; a feature imports that fn, never the wire
// primitive. This is R5 in client-architecture-lockdown.md §10/§16.
//
// THE SUBJECT IS THE AMBIENT GLOBAL, resolved through `resolveGlobalMemberOrigin` — not the four letters.
// The legacy gate matched a bare Identifier callee whose text was "fetch", which meant:
//   · `globalThis.fetch(…)` and `window.fetch(…)` were INVISIBLE (a member callee, so a different node kind);
//   · `const f = fetch; f("/x")` was invisible (the spelling moved);
//   · a feature-local PARAMETER or helper named `fetch` was a FALSE RED (the manifest's own recorded blind
//     spot: "a local parameter/function/import named `fetch` false-reds and `globalThis.fetch` is invisible").
// Both directions are fixed by asking the checker where the binding comes from.
//
// THREE ANSWERS: the ambient global is the finding; a proven local/imported binding passes; a candidate the
// readers cannot place is REPORTED as unreadable (GATE-AUTHORING §5, #944).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";

const FETCH = "fetch";
const MESSAGE =
  "a client feature hand-writes a global `fetch(` — a feature NEVER writes fetch(). HTTP-route egress " +
  "gets ONE data/ fetch fn each (beside upload-asset.ts / auth-session.ts), imported via #data; " +
  "everything else is tRPC. See client-architecture-lockdown.md §10/§16 R5.";
const UNREADABLE =
  "this feature call is spelled like the global `fetch` but the shared readers cannot place its binding, so whether it is the wire primitive R5 bans CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** Could this callee name the global at all? A bare `fetch`, or any member read whose leaf is `fetch`
 *  (`globalThis.fetch`, `window.fetch`, `self["fetch"]`). `q.refetch()` has a different leaf and is not a
 *  candidate — that is the near-miss the legacy gate got right and this one must keep. */
function fetchCandidate(callee: MorphNode): boolean {
  if (Node.isIdentifier(callee)) {
    return callee.getText() === FETCH;
  }
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName() === FETCH;
  }
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const argument = callee.getArgumentExpression();
  return argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) && argument.getLiteralText() === FETCH;
}

type FetchVerdict = "global" | "other" | "unreadable";

function classify(callee: MorphNode): FetchVerdict {
  const global = resolveGlobalMemberOrigin(callee);
  if (global.kind === "resolved") {
    return global.value.globalName === FETCH && global.value.memberPath.length === 0 ? "global" : "other";
  }
  // An IMPORTED `fetch` (a polyfill, a project wrapper) is a proven different identity — R5 is about the
  // ambient wire primitive, and importing a data/ fetch fn is the sanctioned shape the message names.
  if (resolveModuleMemberOrigin(callee).kind === "resolved") {
    return "other";
  }
  return classifyOriginRefusal(global.reason, callee);
}

export const gate = defineGate({
  id: "fetch-fn-in-features",
  family: "fetch-fn-in-features",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "move the raw fetch into a data/ fetch fn (the auth-session.ts / upload-asset.ts precedent) and import it from #data; use tRPC for non-multipart/binary/streaming.",
  create: (ctx) => {
    // Per-file names bound to something that could BE the global, so `const wire = fetch; wire("/x")` is a
    // candidate at its call site. Filled by the VariableDeclaration visitor, which the dispatcher delivers
    // in document order — a const must be declared before it is evaluated. DECLARED LIMIT (its own mustPass
    // row): a closure that reads the alias TEXTUALLY above the declaration is not indexed in time.
    const aliasesBySource = new Map<string, Set<string>>();
    const aliasesOf = (node: MorphNode): Set<string> => {
      const path = node.getSourceFile().getFilePath();
      let names = aliasesBySource.get(path);
      if (names === undefined) {
        names = new Set<string>();
        aliasesBySource.set(path, names);
      }
      return names;
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node): void => {
            if (!Node.isVariableDeclaration(node)) {
              return;
            }
            const initializer = node.getInitializer();
            const name = node.getNameNode();
            if (initializer !== undefined && Node.isIdentifier(name) && fetchCandidate(initializer)) {
              aliasesOf(node).add(name.getText());
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const aliased = Node.isIdentifier(callee) && aliasesOf(node).has(callee.getText());
            if (!(aliased || fetchCandidate(callee))) {
              return;
            }
            const verdict = classify(callee);
            if (verdict === "other") {
              return;
            }
            const text = callee.getText();
            const offset = Math.max(text.lastIndexOf(FETCH), 0);
            const token = text.includes(FETCH) ? FETCH : text;
            ctx.report.node(callee, { ...(verdict === "unreadable" ? { message: UNREADABLE } : {}), token, offset: token === FETCH ? offset : 0 });
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/load.ts": 'export async function load(): Promise<unknown> {\n  return await fetch("/api/x");\n}\n',
      },
      expect: { count: 1, token: "fetch", messageIncludes: "NEVER writes fetch" },
      why: 'the founding shape — a feature file hand-writing `await fetch("/api/x")`, the R5 offense',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/load.ts": 'export async function load(): Promise<unknown> {\n  return await globalThis.fetch("/api/x");\n}\n',
      },
      expect: { count: 1 },
      why: "`globalThis.fetch` is the SAME wire primitive under a member spelling. The legacy identifier-only check was offered a PropertyAccess callee and answered 'not my subject' — the manifest's own recorded blind spot",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/load.ts":
          'export async function load(): Promise<unknown> {\n  return await globalThis["fetch"]("/api/x");\n}\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL member spelling of the same global (#1506) — the shared member reader normalizes it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/load.ts":
          'const wire = fetch;\nexport async function load(): Promise<unknown> {\n  return await wire("/api/x");\n}\n',
      },
      expect: { count: 1 },
      why: "A CONST ALIAS of the global: the spelling at the call site is `wire`, so only the resolved binding reaches the ban. The `fetch` reference in the alias declaration is not a CALL, so this is exactly one finding",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/refresh.ts": "export function refresh(q: { refetch: () => void }): void {\n  q.refetch();\n}\n",
      },
      why: "a `.refetch()` method call is a different member entirely — the near-miss the legacy gate already handled, kept as a written baseline",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/loader.ts": "export class Loader {\n  fetch(): void {}\n  run(): void {\n    this.fetch();\n  }\n}\n",
      },
      why: "a `this.fetch()` METHOD is a proven local declaration, not the ambient global — case (a) of the refusal classifier",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/inject.ts":
          'export async function load(fetch: (url: string) => Promise<unknown>): Promise<unknown> {\n  return await fetch("/api/x");\n}\n',
      },
      why: "A PARAMETER NAMED fetch shadows the ambient global — the legacy gate FALSE-RED this (its own recorded blind spot), and the resolved binding is what clears it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/auth-session.ts": 'export async function loadSession(): Promise<unknown> {\n  return await fetch("/api/x");\n}\n',
        "packages/client/src/features/thing/lib/use-thing.ts":
          'import { loadSession } from "../../../data/auth-session.ts";\nexport const read = async (): Promise<unknown> => loadSession();\n',
      },
      why: "SCOPE plus the sanctioned shape: a raw fetch in a data/ fetch fn is the HTTP-route seam home and is outside the population, and the feature that imports it writes no primitive at all",
    },
    {
      mode: "types",
      files: {
        "node_modules/cross-fetch/index.d.ts": "export declare function fetch(url: string): Promise<unknown>;\n",
        "packages/client/src/features/thing/lib/polyfill.ts":
          'import { fetch } from "cross-fetch";\nexport async function load(): Promise<unknown> {\n  return await fetch("/api/x");\n}\n',
      },
      why: "SAME NAME, IMPORTED: a module-provided `fetch` is a proven different identity from the ambient global R5 bans. The package door is PLANTED in the row so the import actually resolves — an unresolvable specifier would make this row pass for the wrong reason (an unreadable binding), not because the origin was proven foreign",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/hoisted.ts":
          'export function load(): () => Promise<unknown> {\n  const call = (): Promise<unknown> => wire("/api/x");\n  const wire = fetch;\n  void wire;\n  return call;\n}\n',
      },
      why: "THE DECLARED LIMIT, written down: an alias read TEXTUALLY ABOVE its own declaration is not indexed in time, because the alias set is filled in document order. Chasing it would need a second whole-file pass inside the policy, which the shared query boundary forbids; the direct `fetch(` spelling in the same body is still caught",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/thing/lib/load.ts":
          "export async function load(): Promise<unknown> {\n" +
          "  // @orb-waive fetch-fn-in-features(fetch): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          '  return await fetch("/api/x");\n' +
          "}\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the CALLEE and the token is `fetch` even under a member spelling (`globalThis.fetch` reports `fetch` at an offset, :119-122), so one waiver vocabulary covers every spelling of the global. The fixture is mustFlag[0] (:134, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes. The alias row (mustFlag[3]) is deliberately NOT the base — its callee text is `wire`, so its position is the alias name, not `fetch`",
    },
  ],
});
