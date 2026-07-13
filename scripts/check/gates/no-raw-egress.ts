// Gate: no-raw-egress — a bare `fetch(` in packages/server/src must go through `safeFetch` (the
// self-enforcing resolve→validate→pin SSRF guard, infra/network). Raw fetch is sanctioned ONLY in
// infra/network/** and infra/providers/** (configured-endpoint/loopback provider egress); untrusted
// content egress elsewhere is RED. PLUS a literal ban on `corsproxy.io` anywhere in server source.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const FETCH = "fetch";
const CORSPROXY = "corsproxy.io";

/** Paths where a raw `fetch(` is sanctioned (credentialed/loopback provider egress + safeFetch's home). */
const FETCH_SANCTIONED: readonly RegExp[] = [
  /\/packages\/server\/src\/infra\/network\//u,
  /\/packages\/server\/src\/infra\/providers\//u,
];

const FETCH_MESSAGE =
  "bare `fetch(` outside the sanctioned provider-egress zones — route untrusted/user-influenced egress " +
  "through `safeFetch` (the self-enforcing SSRF guard, infra/network). Sanctioned raw-fetch: infra/network " +
  "· infra/providers (vLLM/custom-BYO). See Core-Path-Registry.md D61 (B5a).";
const CORSPROXY_MESSAGE =
  "`corsproxy.io` is the NAMED-REJECTED third-party CORS proxy (D61 B5a) — never route egress through it. " +
  "See Core-Path-Registry.md D61.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

const STRING_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
];

function isFetchSanctioned(rel: string): boolean {
  return FETCH_SANCTIONED.some((re) => re.test(`/${rel}`));
}

function isBareFetchCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = node.getExpression();
  return callee.isKind(SyntaxKind.Identifier) && callee.getText() === FETCH;
}

export const gate: GateDescriptor = {
  name: "no-raw-egress",
  docRow: "Core-Path-Registry.md D61 (B5a)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: FETCH_MESSAGE,
  fix: "route untrusted/user-influenced egress through `safeFetch` (infra/network); sanctioned raw-fetch zones are infra/network + infra/providers.",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.CallExpression, ...STRING_KINDS],
  visit: (node, sf, ctx) => {
    const rel = relPath(ctx.root, sf.getFilePath());
    if (isBareFetchCall(node)) {
      if (!isFetchSanctioned(rel)) {
        ctx.report(node, { token: `${FETCH}(…)`, offset: 0 });
      }
      return;
    }
    // A string/template PART carrying `corsproxy.io` — banned server-wide (comments are excluded: only
    // literal nodes are walked here).
    if (node.getText().includes(CORSPROXY)) {
      const abs = sf.getFilePath();
      ctx.report({
        file: abs.startsWith(ctx.root) ? abs.slice(ctx.root.length + 1) : abs,
        line: node.getStartLineNumber(),
        column: node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column,
        message: CORSPROXY_MESSAGE,
        token: CORSPROXY,
      });
    }
  },
  mustFlag: [
    {
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/server/src/domain/hub/verbs/browse.ts",
      expect: { messageIncludes: "safeFetch" },
      why: "a bare fetch( in an unsanctioned server zone — the SSRF/exfil hole B5a closes",
    },
    {
      files: 'export const proxy = "https://corsproxy.io/?url=";\n',
      at: "packages/server/src/domain/hub/lib/x.ts",
      expect: { messageIncludes: "corsproxy.io" },
      why: "the NAMED-REJECTED third-party CORS proxy literal anywhere in server source",
    },
    {
      // de-sanctioned 2026-07-09: the provider-returned image URL is response-controlled, so a raw fetch
      // in imagery generate-picture is an SSRF hole — it must ride the fetchImage port → safeFetch.
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/server/src/domain/imagery/verbs/generate-picture.ts",
      expect: { messageIncludes: "safeFetch" },
      why: "imagery generate-picture is de-sanctioned — its provider-returned URL is response-controlled, a raw fetch flags",
    },
  ],
  mustPass: [
    {
      files:
        'export async function f(c: { fetch: (u: string) => Promise<unknown> }) {\n  await safeFetch("https://x", { allowedHosts: [] });\n  await c.fetch("https://y");\n}\n',
      at: "packages/server/src/domain/hub/verbs/browse.ts",
      why: "safeFetch( and a method .fetch( pass — only the bare `fetch` identifier callee is banned",
    },
    {
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/server/src/infra/providers/vllm/engine/client.ts",
      why: "a raw fetch in the sanctioned provider-egress zone (vLLM loopback) passes",
    },
    {
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/server/src/infra/network/openai-models.ts",
      why: "a raw fetch in the sanctioned infra/network zone (the /models catalog probe + safeFetch home) passes",
    },
    {
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/client/src/x.ts",
      why: "scope: non-server source is not scanned — passes",
    },
  ],
};
