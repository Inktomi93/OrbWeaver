// The §7.5 CSP policy, pinned per directive (prod strict / dev loosened) — the "CSP-headers-present"
// gate half from D44 §12.6. A tiny real Hono app runs the middleware so the assertions cover the
// header the browser actually receives, not an internal option object.
//
// The external-media arm is the placebo fix: the app-tier "Block external media" AppSetting is the
// deployment CEILING, so `img-src`/`media-src` MUST gain `https:` exactly when the setting allows it —
// and NOTHING else may move with it (never script-src, never http:). The LIVENESS test pins the property
// that made the setting a placebo in the first place: the header is derived per REQUEST, not frozen at
// middleware construction. The last test pins the CEILING against the OTHER tier (owner ruling
// 2026-08-01): a per-character opt-in may not widen either layer.

import type { RenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import { resolveRenderPolicy } from "@orb/contracts/chat";
import { securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

async function headersFor(dev: boolean, allowExternalMedia = false): Promise<Headers> {
  const app = new Hono();
  app.use("*", securityHeaders({ dev, allowExternalMedia: () => allowExternalMedia }));
  app.get("/", (c) => c.text("ok"));
  const res = await app.request("/");
  return res.headers;
}

async function cspFor(dev: boolean, allowExternalMedia = false): Promise<string> {
  return (await headersFor(dev, allowExternalMedia)).get("content-security-policy") ?? "";
}

describe("securityHeaders", () => {
  test("prod CSP: strict script/connect, no data: images, sandboxed-object/frame posture", async () => {
    const csp = await cspFor(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'"); // deliberate — Tailwind + Base UI inline styles
    expect(csp).toContain("img-src 'self' blob:");
    expect(csp).not.toContain("img-src 'self' data:"); // D44: no data-URI images
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("worker-src 'self' blob:"); // blob-URL workers/SharedWorkers (dev AND prod)
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("ws:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("dev loosens EXACTLY the two HMR directives", async () => {
    const csp = await cspFor(true);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    // Everything else stays prod-strict.
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("object-src 'none'");
  });

  test("external media BLOCKED (the floor): no https: anywhere in the policy", async () => {
    const [prod, dev] = await Promise.all([cspFor(false, false), cspFor(true, false)]);
    expect(prod).not.toContain("https:");
    expect(dev).not.toContain("https:");
  });

  test("external media ALLOWED: img-src AND media-src gain https: — in prod and in dev", async () => {
    const prod = await cspFor(false, true);
    expect(prod).toContain("img-src 'self' blob: https:");
    expect(prod).toContain("media-src 'self' blob: https:");

    const dev = await cspFor(true, true);
    expect(dev).toContain("img-src 'self' blob: data: https:");
    expect(dev).toContain("media-src 'self' blob: https:");
  });

  test("external media ALLOWED moves ONLY those two directives — never script/connect/font/object, never http:", async () => {
    const [blocked, allowed] = await Promise.all([cspFor(false, false), cspFor(false, true)]);
    const isMediaDirective = (d: string): boolean => d.startsWith("img-src ") || d.startsWith("media-src ");
    const withoutMedia = (csp: string): string =>
      csp
        .split("; ")
        .filter((d) => !isMediaDirective(d))
        .join("; ");

    // The loosening is scoped: `https:` never appears outside img-src/media-src…
    expect(withoutMedia(allowed)).not.toContain("https:");
    // …and every other directive is byte-identical to the blocked policy.
    expect(withoutMedia(allowed)).toBe(withoutMedia(blocked));

    // A plaintext subresource stays barred in BOTH arms (no HSTS here — see security-headers.ts).
    expect(allowed).not.toContain("http:");
    expect(allowed).toContain("script-src 'self';");
    expect(allowed).toContain("connect-src 'self';");
    expect(allowed).toContain("font-src 'self';");
    expect(allowed).toContain("object-src 'none'");
  });

  test("LIVENESS: the allowance is read PER REQUEST, not frozen at construction", async () => {
    let allow = false;
    const app = new Hono();
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => allow }));
    app.get("/", (c) => c.text("ok"));

    const before = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(before).not.toContain("https:");

    allow = true;
    const after = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(after).toContain("img-src 'self' blob: https:");

    // …and back: flipping the setting on again re-tightens without a restart.
    allow = false;
    const again = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(again).toBe(before);
  });

  // The tighten-only ceiling, across BOTH enforcement layers (owner ruling 2026-08-01). The CSP is built
  // from the DEPLOYMENT value ALONE — it has no per-character input by construction — so this asserts the
  // pair that has to agree: the render-policy resolver refuses to widen for an opted-in card, AND the
  // header the browser gets for that same request carries no `https:` media allowance.
  test("deployment BLOCKS + a per-character opt-in: the row verdict stays blocked AND the CSP gains no https:", async () => {
    const deployment: RenderPolicy = { trustHtml: false, forbidExternalMedia: true };
    const optInCard: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: false };

    // Layer 1 — the resolved per-participant policy the client renders from.
    expect(resolveRenderPolicy(deployment, optInCard).forbidExternalMedia).toBe(true);

    // Layer 2 — the document CSP, wired exactly as entry/app.ts does (`() => !cfg.forbidExternalMedia`).
    const [prod, dev] = await Promise.all([cspFor(false, !deployment.forbidExternalMedia), cspFor(true, !deployment.forbidExternalMedia)]);
    expect(prod).not.toContain("https:");
    expect(dev).not.toContain("https:");
    // The card's opt-in is not an input to the header at all — same bytes as the no-card blocked arm.
    expect(prod).toBe(await cspFor(false, false));
  });

  test("sibling headers: frame-deny, nosniff, referrer, COOP; NO HSTS (plain-http LAN self-host)", async () => {
    const h = await headersFor(false);
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(h.get("strict-transport-security")).toBeNull();
  });
});
