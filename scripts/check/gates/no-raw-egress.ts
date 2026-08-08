// Gate: no-raw-egress — a bare `fetch(` anywhere in packages/server/src must go through `safeFetch`, the
// SELF-ENFORCING SSRF guard (infra/network, H1/D61 landed): per-request+per-hop scheme pin (https-only,
// unless the owner-configured-endpoint policy permits the operator's own backend), a REQUIRED host
// allowlist (or the explicit ANY_HOST escape for the provider-URL/scrapeWeb classes), resolve→validate→pin
// against the private-range set, a default deadline, and a typed EgressBlockedError — all independent of
// the global EGRESS_FIREWALL toggle. Raw `fetch(` is sanctioned ONLY in infra/network/** (the guard's own
// home) and infra/providers/** (credentialed/loopback provider egress); a bare fetch anywhere else in
// server source is RED. PLUS a literal ban on `corsproxy.io` anywhere in server source (the D61-rejected
// third-party CORS proxy, made unspellable).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const FETCH = "fetch";
const CORSPROXY = "corsproxy.io";

/** Paths where a raw `fetch(` is sanctioned (credentialed/loopback provider egress + safeFetch's home).
 *  TWO-SIDED (gate-hub #10): a zone with NO bare `fetch(` left in it is RED — the sanction ratchets down
 *  with the code, so a zone that stops doing raw egress (or gets renamed out from under the pattern) can
 *  never sit here as a standing licence for the next raw fetch someone drops in. */
const FETCH_SANCTIONED: readonly RegExp[] = [/\/packages\/server\/src\/infra\/network\//u, /\/packages\/server\/src\/infra\/providers\//u];

const GATE_SELF = "scripts/check/gates/no-raw-egress.ts";
/** Real-tree anchor (gate-hub #11): safeFetch's own home — the file this whole gate routes egress to. */
const ANCHOR = "packages/server/src/infra/network/egress.ts";
const STALE_PREFIX =
  "stale FETCH_SANCTIONED zone — no bare `fetch(` is left anywhere it matches (ratchet down): the zone " +
  "either stopped doing raw egress or was renamed out from under the pattern, and a dead zone row is a " +
  "standing licence for the next raw fetch dropped into it. Re-point or delete it: ";
/** The sanctioned zones that actually covered a bare `fetch(` this run — the stale arm's truth set. */
const seenZones = new Set<string>();

// THE ONE REASON, carrying BOTH source arms by token. `corsproxy.io`'s own message folded in here when that
// arm stopped riding the Finding overload (which bypasses `hasGateIgnore` — GATE-AUTHORING §1 — so every
// `@orb-gate-ignore no-raw-egress(corsproxy.io)` was inert). The stale-zone arm in `finalize` still carries
// its own message: it anchors on the GATE FILE and is the sanctioned Finding-overload use.
const FETCH_MESSAGE =
  "banned egress spelling. `fetch(…)`: a bare `fetch(` outside the sanctioned provider-egress zones — route " +
  "untrusted/user-influenced egress through `safeFetch` (the self-enforcing SSRF guard: REQUIRED " +
  "allowedHosts + scheme pin + resolve→validate→pin + deadline + typed EgressBlockedError, infra/network). " +
  "Sanctioned raw-fetch: infra/network · infra/providers (vLLM/custom-BYO). `corsproxy.io`: the " +
  "NAMED-REJECTED third-party CORS proxy — never route egress through it, anywhere in server source. " +
  "See Core-Path-Registry.md D61 (B5a).";

/** Repo-relative path — the fetch arm's zone lookup reads it (the report no longer needs it: the node
 *  overload derives the file from the node itself). */
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
  const zone = FETCH_SANCTIONED.find((re) => re.test(`/${rel}`));
  if (zone === undefined) {
    return false;
  }
  seenZones.add(zone.source);
  return true;
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
      ctx.report(node, { token: CORSPROXY, offset: 0 });
    }
  },
  begin: () => {
    seenZones.clear();
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    // THE SANCTIONED Finding overload (§1): the stale-zone finding anchors on the GATE FILE, not on a source
    // node — there is nothing to hang a marker off, and a stale exemption must not be suppressible anyway.
    for (const zone of FETCH_SANCTIONED) {
      if (!seenZones.has(zone.source)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${zone.source} — the zone list lives in scripts/check/gates/no-raw-egress.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export async function f() {\n  return await fetch("https://x");\n}\n',
      at: "packages/server/src/domain/hub/verbs/browse.ts",
      expect: { token: "fetch(…)" },
      why: "a bare fetch( in an unsanctioned server zone — the SSRF/exfil hole B5a closes",
    },
    {
      files: 'export const proxy = "https://corsproxy.io/?url=";\n',
      at: "packages/server/src/domain/hub/lib/x.ts",
      expect: { token: "corsproxy.io" },
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
    {
      files: {
        [ANCHOR]: "export const safeFetch = null;\n",
        "packages/server/src/infra/providers/vllm/engine/client.ts": 'export async function f() {\n  return await fetch("https://x");\n}\n',
      },
      expect: { count: 1, messageIncludes: "stale FETCH_SANCTIONED zone" },
      why: "THE STALE ARM at zone grain: the anchor (safeFetch's home) is loaded, the providers zone still covers a bare fetch and stands — the infra/network zone covers none any more, so exactly that row ratchets down",
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
      why: "scope: non-server source is not scanned — passes (and with no anchor loaded the stale arm stays silent: THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: 'export async function raw() {\n  return await fetch("https://x");\n}\n',
        "packages/server/src/infra/providers/vllm/engine/client.ts": 'export async function f() {\n  return await fetch("https://x");\n}\n',
      },
      why: "both zones STILL EARNED, judged against the real-tree anchor: each covers a live bare fetch, so neither the per-node arm nor the stale arm fires",
    },
  ],
};
