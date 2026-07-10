// Gate: no-raw-egress (D61 B5a — the hardened-egress guard). A bare `fetch(` in `packages/server/src`
// must go through `safeFetch` (the self-enforcing per-request resolve→validate→pin SSRF guard,
// `infra/network`) — a raw `fetch` against a user-influenced URL is the SSRF/exfil hole B5a closes. Raw
// `fetch` is sanctioned ONLY in the credentialed/loopback PROVIDER-egress tier + safeFetch's own home
// (each a configured-endpoint or localhost call, a different trust class than untrusted user content):
//   • infra/network/** — safeFetch's impl home + the `/models` catalog probe.
//   • infra/providers/** — the sealed runner tier (vLLM loopback engine · custom-BYO configured endpoint).
//   • domain/imagery/verbs/generate-picture.ts — downloads the provider-returned generated image URL.
// Untrusted-content egress (hub browse, databank scrapers, server-side D44 external media) lives OUTSIDE
// these zones, so a raw `fetch` there is RED — route it through `safeFetch`. PLUS a literal ban on
// `corsproxy.io` (the NAMED-REJECTED third-party proxy fallback, D61) anywhere in server source.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const FETCH = "fetch";
const CORSPROXY = "corsproxy.io";

/** Paths where a raw `fetch(` is sanctioned (credentialed/loopback provider egress + safeFetch's home). */
const FETCH_SANCTIONED: readonly RegExp[] = [
  /\/packages\/server\/src\/infra\/network\//u,
  /\/packages\/server\/src\/infra\/providers\//u,
  /\/packages\/server\/src\/domain\/imagery\/verbs\/generate-picture\.ts$/u,
];

const FETCH_MESSAGE =
  "bare `fetch(` outside the sanctioned provider-egress zones — route untrusted/user-influenced egress " +
  "through `safeFetch` (the self-enforcing SSRF guard, infra/network). Sanctioned raw-fetch: infra/network " +
  "· infra/providers (vLLM/custom-BYO) · domain/imagery generate-picture. See Core-Path-Registry-D60-D61.md " +
  "D61 (B5a).";
const CORSPROXY_MESSAGE =
  "`corsproxy.io` is the NAMED-REJECTED third-party CORS proxy (D61 B5a) — never route egress through it. " +
  "See Core-Path-Registry-D60-D61.md D61.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Bare `fetch(...)` call sites (callee is the identifier `fetch`, not `x.fetch`/`safeFetch`). */
function rawFetchViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (callee.isKind(SyntaxKind.Identifier) && callee.getText() === FETCH) {
      out.push({ file: rel, line: call.getStartLineNumber(), message: FETCH_MESSAGE });
    }
  }
  return out;
}

/** `corsproxy.io` inside any string/template literal (comments cite the ban legitimately, so excluded). */
function corsproxyViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const kind of [
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateHead,
    SyntaxKind.TemplateMiddle,
    SyntaxKind.TemplateTail,
  ] as const) {
    for (const lit of sf.getDescendantsOfKind(kind)) {
      if (lit.getText().includes(CORSPROXY)) {
        out.push({ file: rel, line: lit.getStartLineNumber(), message: CORSPROXY_MESSAGE });
      }
    }
  }
  return out;
}

export const noRawEgress: Check = {
  name: "no-raw-egress",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!SERVER_SRC.test(path)) {
        continue;
      }
      const rel = relPath(root, path);
      if (!FETCH_SANCTIONED.some((re) => re.test(path))) {
        violations.push(...rawFetchViolations(sf, rel));
      }
      violations.push(...corsproxyViolations(sf, rel));
    }
    return violations;
  },
};
