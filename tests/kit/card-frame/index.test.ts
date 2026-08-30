// The card-frame security engine. These are the VERBATIM policy strings two packages build a boundary
// from, so they are asserted whole rather than by `toContain` — a directive silently dropped by a refactor
// is exactly the failure a substring assertion cannot see.

import { createHash } from "node:crypto";
import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_HEIGHT_SCRIPT,
  CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH,
  CARD_FRAME_MAX_HEIGHT_PX,
  CARD_FRAME_MIN_HEIGHT_PX,
  CARD_FRAME_POSTURES,
  CARD_FRAME_SAFE_FLOOR,
  CARD_FRAME_SANDBOX,
  clampCardFrameFontFamily,
  clampCardFrameStyleTokens,
  clampCardFrameThemeTokens,
  foldCardFrameHeight,
} from "@orb/kit/card-frame";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const BASE = "default-src 'none'; img-src {M}; media-src {M}; style-src 'unsafe-inline'; font-src 'self'; form-action 'none'; base-uri 'none'";
const meta = (media: string): string => BASE.replaceAll("{M}", media);
// A bare `http:` SCHEME source (never a `http://` inside a URL) — the thing the policy must never grant.
const PLAIN_HTTP_SCHEME = /\bhttp:(?!\/)/u;
const doc = (media: string): string => `sandbox allow-scripts; script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}; ${meta(media)}; frame-ancestors 'self'`;

describe("buildCardFrameCsp — the document (routed) arm", () => {
  test("floors to self-only media, and always carries sandbox + frame-ancestors", () => {
    expect(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static")).toBe(doc("'self'"));
  });

  test("grants data: ONLY on the trust axis and https: ONLY on the external axis", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document", "static")).toBe(doc("'self' data:"));
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: false }, "document", "static")).toBe(doc("'self' https:"));
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document", "static")).toBe(doc("'self' data: https:"));
  });

  test("never emits http: — the app is commonly served over plain-http LAN, so a cleartext subresource is an exfil channel", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document", "static")).not.toContain("http:;");
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document", "static")).not.toMatch(PLAIN_HTTP_SCHEME);
  });
});

// ── THE TIER-B HEIGHT CHANNEL (2026-08-16 security pass, #91) ────────────────────────────────────────────
// `allow-scripts` is granted on the routed arm for exactly ONE script. The hash IS the grant, so these
// tests are the gate on it: the digest is RECOMPUTED from the script text rather than compared to a second
// copy of the constant, because a stale hash means either our measurement silently stops running or — the
// direction that matters — the allowance stops naming the thing it was reviewed against.

describe("the hash-pinned height script", () => {
  test("the CSP hash is the ACTUAL digest of the script text — recomputed, never restated", () => {
    const digest = createHash("sha256").update(CARD_FRAME_HEIGHT_SCRIPT, "utf8").digest("base64");
    expect(CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH).toBe(`'sha256-${digest}'`);
  });

  test("the script cannot close its own tag or reach the network — it measures and posts, nothing else", () => {
    expect(CARD_FRAME_HEIGHT_SCRIPT).not.toContain("</script");
    // `document.body.scrollHeight`, never `documentElement` (floored at the viewport ⇒ a short card could
    // never report smaller than the frame it is trying to shrink — the #91 defect itself).
    expect(CARD_FRAME_HEIGHT_SCRIPT).toContain("body.scrollHeight");
    expect(CARD_FRAME_HEIGHT_SCRIPT).not.toContain("documentElement.scrollHeight");
    for (const reach of ["fetch(", "XMLHttpRequest", "eval(", "Function(", "import(", "location", "cookie", "document.domain"]) {
      expect(CARD_FRAME_HEIGHT_SCRIPT).not.toContain(reach);
    }
  });

  test("the grant is routed-only and NEVER same-origin — the srcdoc floor stays every-restriction-on", () => {
    expect(CARD_FRAME_SANDBOX.document).toBe("allow-scripts");
    expect(CARD_FRAME_SANDBOX.meta).toBe("");
    expect(Object.values(CARD_FRAME_SANDBOX).join(" ")).not.toContain("allow-same-origin");
  });

  test("the document policy names the ONE hash and no other script source", () => {
    const csp = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static");
    // The DIRECTIVE, whole — `style-src 'unsafe-inline'` is a legitimate neighbour, so a whole-policy
    // substring check would read as a pass for the very keyword this asserts against.
    const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src "));
    expect(scriptSrc).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
    // The keywords that would turn a one-script allowance into card-authored code execution, plus the
    // `on*=`/`javascript:` opener. None is nameable here.
    for (const keyword of ["unsafe-inline", "unsafe-hashes", "unsafe-eval", "strict-dynamic", "nonce-", "http", "*"]) {
      expect(scriptSrc).not.toContain(keyword);
    }
    expect(csp).not.toContain("connect-src");
  });

  test("only the ROUTED document carries the script — the floor would emit markup its policy can never run", () => {
    const content = { html: "<p>hi</p>", css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined };
    const routed = buildCardFrameDocument(content);
    expect(routed).toContain(`<script>${CARD_FRAME_HEIGHT_SCRIPT}</script>`);
    // In HEAD, ahead of the card body: model-authored markup (an unclosed `<!--`) must not be able to
    // swallow the one element in the document that is allowed to execute.
    expect(routed.indexOf("<script>")).toBeLessThan(routed.indexOf("<body>"));
    expect(buildCardFrameDocument(content, "default-src 'none'")).not.toContain("<script>");
  });
});

// ── THE POSTURE SEAM (#111 legs 1+3) ─────────────────────────────────────────────────────────────────────
// `CardFramePosture` selects which `script-src` a routed document is built with. Leg 1 made the SELECTION
// real while both arms named the same hash; the leg-3 security pass (2026-08-16) moved the `interactive`
// row to `'unsafe-inline'` and nothing else. The "byte-identical postures" pin that guarded the gap is
// REPLACED below by pins on the exact ruled delta — a stronger statement than the one it retires, because
// it says both what moved and everything that did not.

describe("the card-frame posture seam", () => {
  test("the postures differ by EXACTLY the script-src directive — every other byte is identical", () => {
    expect([...CARD_FRAME_POSTURES]).toEqual(["static", "interactive"]);
    const media = { allowExternalMedia: true, allowInlineData: true } as const;
    const split = (posture: (typeof CARD_FRAME_POSTURES)[number]): string[] => buildCardFrameCsp(media, "document", posture).split("; ");
    const staticDirectives = split("static");
    const interactiveDirectives = split("interactive");
    // Same directives, same ORDER, one differing entry — so a widening that rides along with the grant
    // (an added `connect-src`, a dropped `form-action`, a reordered `sandbox`) reds here.
    expect(interactiveDirectives).toHaveLength(staticDirectives.length);
    const differing = staticDirectives.filter((directive, index) => directive !== interactiveDirectives[index]);
    expect(differing).toEqual([`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`]);
  });

  test("THE GRANT: the interactive arm is `script-src 'unsafe-inline'` and REPLACES the hash", () => {
    const scriptSrc = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "interactive")
      .split("; ")
      .find((directive) => directive.startsWith("script-src "));
    expect(scriptSrc).toBe("script-src 'unsafe-inline'");
    // THE HASH MUST NOT RIDE ALONG. Measured 2026-08-16 (Chromium 149): with a hash-source present,
    // 'unsafe-inline' is IGNORED — "Note that 'unsafe-inline' is ignored if either a hash or nonce value is
    // present in the source list" — so `script-src 'unsafe-inline' 'sha256-…'` refuses the card's script
    // and the grant would read live while granting nothing. This is the pin on that whole class.
    expect(scriptSrc).not.toContain("sha256-");
    expect(scriptSrc).not.toContain("nonce-");
    // …and the keywords the grant deliberately did NOT buy. `unsafe-eval` is the one that matters most:
    // 'unsafe-inline' lets a card ship code, `unsafe-eval` would let it build code at runtime.
    for (const keyword of ["unsafe-eval", "unsafe-hashes", "strict-dynamic", "http", "*"]) {
      expect(scriptSrc).not.toContain(keyword);
    }
  });

  test("the STATIC arm is untouched by the grant — no card-authored script source, on any media policy", () => {
    for (const media of [CARD_FRAME_SAFE_FLOOR, { allowExternalMedia: true, allowInlineData: true }]) {
      const scriptSrc = buildCardFrameCsp(media, "document", "static")
        .split("; ")
        .find((directive) => directive.startsWith("script-src "));
      expect(scriptSrc).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
      for (const keyword of ["unsafe-inline", "unsafe-hashes", "unsafe-eval", "strict-dynamic", "nonce-", "*"]) {
        expect(scriptSrc).not.toContain(keyword);
      }
    }
  });

  test("NO EXFIL DIRECTIVE OPENS WITH THE GRANT — the deny-by-default base is identical on both arms", () => {
    for (const posture of CARD_FRAME_POSTURES) {
      const csp = buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document", posture);
      // `default-src 'none'` is what closes connect-src (fetch/XHR/WebSocket/EventSource/sendBeacon),
      // frame-src (a nested iframe) and worker-src's own name; naming any of them wider would be the
      // regression this asserts against. Measured against a real server in the kit header's reach census.
      expect(csp).toContain("default-src 'none'");
      expect(csp).not.toContain("connect-src");
      expect(csp).not.toContain("frame-src");
      expect(csp).not.toContain("child-src");
      expect(csp).not.toContain("worker-src");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("frame-ancestors 'self'");
      // `webrtc 'block'` is NOT emitted: Chromium 149 reports it "Unrecognized", so it would be dead
      // config. The residual is recorded in the kit header (R1) and answered by the deployment ceiling.
      expect(csp).not.toContain("webrtc");
    }
  });

  test("the SANDBOX does not vary by posture — only script-src is the seam, and same-origin is never nameable", () => {
    for (const posture of CARD_FRAME_POSTURES) {
      const csp = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", posture);
      expect(csp.startsWith(`sandbox ${CARD_FRAME_SANDBOX.document};`)).toBe(true);
      expect(csp).not.toContain("allow-same-origin");
      // Still no exfil channel under either arm.
      expect(csp).not.toContain("connect-src");
    }
  });

  test("the META floor ignores the posture entirely — that arm can never run a script to begin with", () => {
    expect(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "meta", "interactive")).toBe(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "meta", "static"));
    expect(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "meta", "interactive")).not.toContain("script-src");
  });
});

describe("foldCardFrameHeight — the untrusted height message", () => {
  test("a first report is applied, clamped into floor..cap", () => {
    expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: 140 })).toBe(140);
  });

  test("OVERSIZE clamps to the cap — unbounded growth is the failure mode the clamp exists for", () => {
    expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: 10_000_000 })).toBe(CARD_FRAME_MAX_HEIGHT_PX);
  });

  test("SUB-FLOOR clamps to the floor — a card must not collapse itself to an invisible hairline", () => {
    expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: 0 })).toBe(CARD_FRAME_MIN_HEIGHT_PX);
    expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: -5000 })).toBe(CARD_FRAME_MIN_HEIGHT_PX);
  });

  test("NON-NUMERIC and foreign payloads are ignored — the current height survives untouched", () => {
    for (const payload of [
      { orbCardFrameHeight: "420" },
      { orbCardFrameHeight: Number.NaN },
      { orbCardFrameHeight: Number.POSITIVE_INFINITY },
      { orbCardFrameHeight: null },
      { orbCardFrameHeight: { valueOf: (): number => 400 } },
      { someOtherApp: 1 },
      "orbCardFrameHeight",
      42,
      null,
      undefined,
      ["orbCardFrameHeight", 400],
    ]) {
      expect(foldCardFrameHeight(200, payload)).toBe(200);
      expect(foldCardFrameHeight(undefined, payload)).toBeUndefined();
    }
  });

  test("GROW-ONLY after the first report — a card cannot drive a measure/resize/measure loop", () => {
    const first = foldCardFrameHeight(undefined, { orbCardFrameHeight: 150 });
    expect(first).toBe(150);
    // The oscillation a fluid (or hostile) card produces: tall when the frame is short, short when tall.
    expect(foldCardFrameHeight(first, { orbCardFrameHeight: 600 })).toBe(600);
    expect(foldCardFrameHeight(600, { orbCardFrameHeight: 150 })).toBe(600);
    expect(foldCardFrameHeight(600, { orbCardFrameHeight: 599 })).toBe(600);
  });

  test("a fractional height CEILS — rounding down clips the last device pixel and grows a scrollbar", () => {
    expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: 140.2 })).toBe(141);
  });
});

describe("buildCardFrameCsp — the meta (srcdoc floor) arm", () => {
  test("omits sandbox + frame-ancestors, which <meta> ignores by spec — a directive that cannot match teaches a lie", () => {
    const policy = buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: false }, "meta", "static");
    expect(policy).toBe(meta("'self' https:"));
    expect(policy).not.toContain("sandbox");
    expect(policy).not.toContain("frame-ancestors");
  });

  test("DROPS data: even when granted — a srcdoc document inherits the app CSP, so the directive could never match", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "meta", "static")).toBe(meta("'self'"));
  });
});

describe("clampCardFrameThemeTokens", () => {
  test("keeps only `--*` keys whose value is a safe color", () => {
    expect(clampCardFrameThemeTokens({ "--sandbox-bg": "#101014", "--sandbox-fg": "oklch(0.9 0.02 250)" })).toEqual({
      "--sandbox-bg": "#101014",
      "--sandbox-fg": "oklch(0.9 0.02 250)",
    });
  });

  test("drops per-FIELD, never rejecting the whole object — one hostile token must not blank a card's theming", () => {
    expect(clampCardFrameThemeTokens({ "--sandbox-bg": "#101014", "--evil": "url(https://x/)" })).toEqual({ "--sandbox-bg": "#101014" });
  });

  test("drops a value carrying CSS-escape characters — the <style> breakout vector", () => {
    // Each of these would close the `<style>` block or open a new rule if it reached the document.
    expect(clampCardFrameThemeTokens({ "--a": "red}</style><script>x", "--b": "red{", "--c": "red<x" })).toEqual({});
  });

  test("drops non-custom-property keys and non-string values, and survives a non-object", () => {
    expect(clampCardFrameThemeTokens({ color: "#fff", "-x": "#fff" })).toEqual({});
    expect(clampCardFrameThemeTokens({ "--a": 5 })).toEqual({});
    expect(clampCardFrameThemeTokens(["--a", "#fff"])).toEqual({});
    expect(clampCardFrameThemeTokens(null)).toEqual({});
    expect(clampCardFrameThemeTokens("--a: red")).toEqual({});
  });
});

describe("clampCardFrameStyleTokens (#799 — the NON-COLOR slice)", () => {
  test("accepts the two shapes it exists for: a CSS length and a font-family list", () => {
    expect(clampCardFrameStyleTokens({ "--sandbox-radius": "0.5rem", "--sandbox-font-mono": "'Geist Mono', ui-monospace, monospace" })).toEqual({
      "--sandbox-radius": "0.5rem",
      "--sandbox-font-mono": "'Geist Mono', ui-monospace, monospace",
    });
    expect(clampCardFrameStyleTokens({ "--a": "8px", "--b": "100%", "--c": "1.25em", "--d": "0" })).toEqual({
      "--a": "8px",
      "--b": "100%",
      "--c": "1.25em",
      "--d": "0",
    });
  });

  test("is NOT the color clamp — a color goes in `themeTokens`, and a length would be dropped there", () => {
    // The two clamps are disjoint by design; this pair is what stops a future edit from collapsing them into
    // one weaker predicate. `calc()`/`var()` carry parens and are refused outright, never sanitized.
    expect(clampCardFrameStyleTokens({ "--a": "#101014" })).toEqual({});
    expect(clampCardFrameThemeTokens({ "--a": "0.5rem" })).toEqual({});
    expect(clampCardFrameStyleTokens({ "--a": "calc(100% - 2px)", "--b": "var(--x)", "--c": "url(https://evil/)" })).toEqual({});
  });

  test("drops per-FIELD, and drops every <style> breakout / non-custom-property / non-string shape", () => {
    expect(clampCardFrameStyleTokens({ "--sandbox-radius": "0.5rem", "--evil": "8px}</style><script>x" })).toEqual({ "--sandbox-radius": "0.5rem" });
    expect(clampCardFrameStyleTokens({ radius: "0.5rem", "-x": "0.5rem" })).toEqual({});
    expect(clampCardFrameStyleTokens({ "--a": 8 })).toEqual({});
    expect(clampCardFrameStyleTokens(null)).toEqual({});
    expect(clampCardFrameStyleTokens("--a: 8px")).toEqual({});
  });
});

describe("clampCardFrameFontFamily", () => {
  test("accepts a plain family list", () => {
    expect(clampCardFrameFontFamily('Inter, "Helvetica Neue", sans-serif')).toBe('Inter, "Helvetica Neue", sans-serif');
  });

  test("drops anything that could escape the body rule", () => {
    expect(clampCardFrameFontFamily("Inter; } body { background: url(https://evil/)")).toBeUndefined();
    expect(clampCardFrameFontFamily("Inter</style><script>")).toBeUndefined();
    expect(clampCardFrameFontFamily("x".repeat(121))).toBeUndefined();
    expect(clampCardFrameFontFamily(undefined)).toBeUndefined();
    expect(clampCardFrameFontFamily(42)).toBeUndefined();
  });
});

describe("buildCardFrameDocument", () => {
  test("re-clamps on EVERY call — a caller's word for a value is never why it is in the document", () => {
    const html = buildCardFrameDocument({
      html: "<p>hi</p>",
      css: undefined,
      themeTokens: { "--sandbox-bg": "red}</style><script>alert(1)</script>" },
      // #799 — the NON-COLOR slot re-clamps on the same call, with its own grammar. Two hostile shapes, two
      // clamps, one document: neither may reach the `:root` block.
      styleTokens: { "--sandbox-radius": "8px}</style><script>alert(3)</script>" },
      fontFamily: "Inter; } body {",
    });
    // The routed document carries OUR one hash-pinned script, so "no script tags" is no longer the
    // assertion — "no script but ours" is, and a smuggled one would not match the hash anyway.
    expect(html.split("<script>")).toHaveLength(2);
    expect(html).toContain(`<script>${CARD_FRAME_HEIGHT_SCRIPT}</script>`);
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("alert(3)");
    expect(html).not.toContain("--sandbox-radius");
    // The font fell back to the guaranteed sans face rather than carrying the hostile list through.
    expect(html).toContain("font-family: sans-serif;");
  });

  test("passes the card body through VERBATIM — the frame is the boundary, not a sanitizer", () => {
    const body = '<div onclick="steal()"><script>fetch("https://evil")</script></div>';
    expect(buildCardFrameDocument({ html: body, css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined })).toContain(body);
  });

  test("emits the meta policy only when one is supplied — the routed arm's policy lives on the response header", () => {
    const content = { html: "<p>hi</p>", css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined };
    expect(buildCardFrameDocument(content)).not.toContain("http-equiv");
    expect(buildCardFrameDocument(content, "default-src 'none'")).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`);
  });
});
