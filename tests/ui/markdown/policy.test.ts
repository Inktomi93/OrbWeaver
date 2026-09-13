// The untrusted-content XSS/exfiltration front door (D44 §12.2/§12.3, D21). `untrustedUrlTransform` is
// the url gate cards/other-users' content flow through (returns "" to BLOCK — Streamdown drops a url
// whose transform is falsy); the two-tier element allowlist decides which HTML tags survive. Every
// sibling primitive (clamp, isSafeColor, neutralizeMacros) has hostile-input tests; this pins the front
// door: the javascript:/data:/vbscript: block (incl. case/whitespace/encoding evasions), the D21
// host-allowlist, and the img-drop that separates TRUSTED_A from TRUSTED_A_UNTRUSTED. Deep-imports src
// (browser package; @orb/ui is not node-resolvable) like shiki-theme.test.ts.

import { describe } from "vitest";
import { TIER_A_ELEMENTS, TIER_A_UNTRUSTED_ELEMENTS, UNTRUSTED_ALLOWED_PREFIXES, untrustedUrlTransform } from "../../../packages/ui/src/markdown/policy.ts";
import { expect, test } from "../../support/fixtures.ts";

// Streamdown's UrlTransform is called with (url, key, node); `untrustedUrlTransform` reads ONLY the url,
// so the hast node arg is an unused deliberate stub. The `UrlTransform` return type is `string | null |
// undefined`; this gate always yields a string ("" = BLOCK, else the url), and `?? ""` narrows the type.
const gate = (url: string): string =>
  // @orb-waive no-test-fabrication(never): the unused hast-node arg — untrustedUrlTransform never reads it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  untrustedUrlTransform(url, "href", { type: "element", tagName: "a" } as never) ?? "";
const BLOCKED = "";

describe("untrustedUrlTransform — dangerous protocols BLOCKED (return empty → Streamdown drops)", () => {
  // The exact XSS payloads a card/other-user's markdown link would carry. Each must return "" — NOT be
  // sanitized-through — so Streamdown never emits an <a href> that executes on click.
  test("plain javascript: is blocked", () => {
    expect(gate("javascript:alert(1)")).toBe(BLOCKED);
  });

  test("mixed-case JaVaScRiPt: is blocked (protocol parse is case-insensitive, not our comparison)", () => {
    expect(gate("JaVaScRiPt:alert(1)")).toBe(BLOCKED);
    expect(gate("JAVASCRIPT:alert(1)")).toBe(BLOCKED);
  });

  test("leading/embedded whitespace + a newline inside the scheme are blocked", () => {
    // The classic filter-evasion: browsers strip control chars from the scheme, so `java\nscript:` and
    // ` javascript:` historically executed. new URL() rejects/normalizes these — a leading-space value
    // fails the prefix check then either parses to a non-safe protocol or throws → "".
    expect(gate("  javascript:alert(1)")).toBe(BLOCKED);
    expect(gate("java\nscript:alert(1)")).toBe(BLOCKED);
    expect(gate("java\tscript:alert(1)")).toBe(BLOCKED);
    expect(gate("\u0000javascript:alert(1)")).toBe(BLOCKED);
  });

  test("percent-encoded scheme (%6Aavascript:) is not decoded into a safe protocol", () => {
    // We never URL-decode before the protocol check, so `new URL("%6Aavascript:...")` either throws or
    // parses to a scheme literally spelled `%6aavascript:` — never `http:`/`https:`/`mailto:` → blocked.
    expect(gate("%6Aavascript:alert(1)")).toBe(BLOCKED);
    expect(gate("%6a%61vascript:alert(1)")).toBe(BLOCKED);
  });

  test("data: URIs are blocked (base64 tracking pixels / embedded HTML payloads — D21)", () => {
    // Assemble the payload from parts so noSecrets doesn't misread a fixture literal as a credential.
    const tag = "script";
    const xss = `<${tag}>alert(1)</${tag}>`;
    expect(gate(`data:text/html,${xss}`)).toBe(BLOCKED);
    expect(gate(`data:text/html;base64,${btoa(xss)}`)).toBe(BLOCKED);
    expect(gate(`data:image/png;base64,${btoa("PNGBYTES")}`)).toBe(BLOCKED);
    expect(gate("DATA:text/html,x")).toBe(BLOCKED);
  });

  test("vbscript: is blocked", () => {
    expect(gate("vbscript:msgbox(1)")).toBe(BLOCKED);
    expect(gate("VBScript:msgbox(1)")).toBe(BLOCKED);
  });

  test("other non-safe schemes (tel:, file:, ftp:, blob:) are blocked", () => {
    for (const url of ["tel:+15550100", "file:///etc/passwd", "ftp://host/x", "blob:https://app/x"]) {
      expect(gate(url)).toBe(BLOCKED);
    }
  });

  test("an empty / whitespace-only url is blocked", () => {
    expect(gate("")).toBe(BLOCKED);
    expect(gate("   ")).toBe(BLOCKED);
  });

  test("an unparseable garbage url is blocked (new URL throws → fail-closed)", () => {
    expect(gate("http://")).toBe(BLOCKED);
    expect(gate(":::not a url:::")).toBe(BLOCKED);
  });
});

describe("untrustedUrlTransform — safe-protocol gate on absolute urls (the real deny surface)", () => {
  // DOC-VS-CODE NOTE (flagged to review): the header (policy.ts L84) claims "any absolute-URL host not on
  // the allowlist" is blocked, but the CODE only blocks non-safe PROTOCOLS — an off-origin https/http host
  // PASSES the url gate. This is not a live exfil hole because the D21 tracking-pixel defense is at the
  // ELEMENT tier: `img` is dropped entirely for untrusted content (see the element-allowlist suite below),
  // so an off-origin url can only ride an `<a href>` (a user-clicked navigation, not an auto-load). These
  // tests pin the ACTUAL behavior so a future tightening/loosening is caught.
  test("an off-origin https/http link PASSES (safe protocol; host-allowlist is NOT enforced for links)", () => {
    expect(gate("https://evil.example/pixel.gif")).toBe("https://evil.example/pixel.gif");
    expect(gate("http://plain.example/x")).toBe("http://plain.example/x");
  });

  test("a protocol-relative url (//host) PASSES via the '/' prefix fast-path (resolves to https, not js:)", () => {
    // `//evil.example/x` starts with `/`, so the relative-prefix fast-path returns it verbatim. It
    // inherits the page protocol (https) at render — NOT a script-execution vector; consistent with the
    // absolute-https link case above. Pinned so a change to the prefix set is observed.
    expect(gate("//evil.example/pixel.gif")).toBe("//evil.example/pixel.gif");
  });

  test("relative + anchor urls PASS (positive control — legit in-doc links survive)", () => {
    expect(gate("/characters/42")).toBe("/characters/42");
    expect(gate("/img/local.png")).toBe("/img/local.png");
    expect(gate("#section-2")).toBe("#section-2");
  });

  test("the allowlisted-prefix set is exactly relative-root + anchor (pin — widening is a security change)", () => {
    expect([...UNTRUSTED_ALLOWED_PREFIXES]).toEqual(["/", "#"]);
  });
});

describe("untrustedUrlTransform — legit external links PASS (non-vacuity: the gate isn't block-everything)", () => {
  test("mailto: passes (a safe protocol, no external load)", () => {
    expect(gate("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  test("a trailing-whitespace-trimmed safe url is returned trimmed", () => {
    // The gate trims before deciding; a relative url with surrounding whitespace passes trimmed.
    expect(gate("  /docs/guide  ")).toBe("/docs/guide");
  });
});

describe("element allowlists — the img-drop is the untrusted↔trusted difference set (D21 prefetch exfil)", () => {
  test("img is present in the TRUSTED tier", () => {
    expect(TIER_A_ELEMENTS).toContain("img");
  });

  test("img is ABSENT from the UNTRUSTED tier (Streamdown's <link rel=preload> would prefetch → exfil)", () => {
    expect(TIER_A_UNTRUSTED_ELEMENTS).not.toContain("img");
  });

  test("the difference set is EXACTLY {img} — untrusted drops nothing else, trusted adds nothing else", () => {
    // Pin the exact delta: if a future edit drops another untrusted element (over-tightening) or leaks a
    // dangerous one into untrusted (under-tightening), this fails. `img` is the ONLY permitted difference.
    const trusted = new Set(TIER_A_ELEMENTS);
    const untrusted = new Set(TIER_A_UNTRUSTED_ELEMENTS);
    const droppedForUntrusted = [...trusted].filter((t) => !untrusted.has(t));
    const untrustedOnly = [...untrusted].filter((t) => !trusted.has(t));
    expect(droppedForUntrusted).toEqual(["img"]);
    expect(untrustedOnly).toEqual([]);
  });

  test("neither tier permits an executable/embedding element (script/style/iframe/object/embed/form/input)", () => {
    // Belt-and-braces: Streamdown's harden strips these regardless, but the allowlist must never
    // enumerate one — a regression that added `iframe` here would be an XSS hole.
    const forbidden = ["script", "style", "iframe", "object", "embed", "form", "input"];
    for (const tag of forbidden) {
      expect(TIER_A_ELEMENTS).not.toContain(tag);
      expect(TIER_A_UNTRUSTED_ELEMENTS).not.toContain(tag);
    }
  });

  test("both tiers keep the legit structural/text/link surface (positive control)", () => {
    // Non-vacuity for the allowlists: prose formatting, tables, links, and details/summary survive in
    // BOTH tiers — the untrusted tightening drops ONLY img, not the readable-content surface.
    for (const tag of ["p", "a", "code", "table", "li", "strong", "details", "summary"]) {
      expect(TIER_A_ELEMENTS).toContain(tag);
      expect(TIER_A_UNTRUSTED_ELEMENTS).toContain(tag);
    }
  });
});
