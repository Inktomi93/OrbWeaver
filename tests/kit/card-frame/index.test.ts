import { createHash } from "node:crypto";
import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_SAFE_FLOOR,
  CARD_FRAME_SANDBOX,
  clampCardFrameFontFamily,
  clampCardFrameStyleTokens,
  clampCardFrameThemeTokens,
} from "@orb/kit/card-frame";
import { expect, test } from "@orb/testkit/node";

const CONTENT = { html: "<p>card</p>", css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined } as const;
const MEDIA_DIRECTIVES = ["img-src", "media-src"];
const POSTURES = ["static", "interactive"] as const;
// The reviewed grant, spelled out on purpose: it is the contract under test, so a widened constant must fail here
// rather than flow into both the expectation and the policy.
const ROUTED_SANDBOX_GRANT = "allow-scripts";
const HOSTILE_THEME_TOKENS = {
  "--accent": "url(//evil.test/x.png)",
  "--evil": "red; } </style><script>window.__pwned=1</script>",
  "not-a-custom-prop": "#336699",
  "--safe": "#336699",
};
const HOSTILE_STYLE_TOKENS = {
  "--sandbox-radius": "8px} </style><script>window.__pwned=1</script>",
  "--calc": "calc(100% - 2px)",
  "--fetch": "url(//evil.test/x.png)",
  // A color has no place in the non-color slot: the two grammars must stay disjoint.
  "--sandbox-accent": "#336699",
  "--ok": "12px",
};
const HOSTILE_FONT_FAMILY = "Geist; } body { background: url(//evil) } /*";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name = "", ...sources] = part.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

test("the static script-src pins the digest of the one script the routed document emits", () => {
  const document = buildCardFrameDocument(CONTENT);
  const bodies = [...document.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((match) => match[1] ?? "");
  expect(bodies).toHaveLength(1);
  const digest = createHash("sha256")
    .update(bodies[0] ?? "")
    .digest("base64");
  expect(directives(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static")).get("script-src")).toBe(`'sha256-${digest}'`);
});

test("the interactive posture replaces the hash with 'unsafe-inline' because a hash would void the keyword", () => {
  const interactive = directives(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "interactive")).get("script-src");
  expect(interactive).toBe("'unsafe-inline'");
});

test("the srcdoc delivery names no directive a meta policy cannot carry and emits no script", () => {
  const meta = directives(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, "meta", "static"));
  for (const ignoredInMeta of ["sandbox", "script-src", "frame-ancestors"]) {
    expect(meta.has(ignoredInMeta), ignoredInMeta).toBe(false);
  }
  expect(meta.get("img-src")).not.toContain("data:");
  expect(buildCardFrameDocument(CONTENT, "default-src 'none'")).not.toContain("<script");
});

test("the routed sandbox grants exactly allow-scripts, on the attribute and in the served directive; the floor grants nothing", () => {
  expect(CARD_FRAME_SANDBOX).toEqual({ document: ROUTED_SANDBOX_GRANT, meta: "" });
  for (const posture of POSTURES) {
    expect(directives(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", posture)).get("sandbox"), posture).toBe(ROUTED_SANDBOX_GRANT);
  }
});

test("no delivery or posture opens connect-src, forms or base retargeting, and nothing admits plaintext http", () => {
  for (const delivery of ["document", "meta"] as const) {
    for (const posture of POSTURES) {
      const csp = directives(buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, delivery, posture));
      const arm = `${delivery}/${posture}`;
      expect(csp.has("connect-src"), arm).toBe(false);
      expect(csp.get("default-src"), arm).toBe("'none'");
      // Neither falls back to default-src, so each must be named to be closed.
      expect(csp.get("form-action"), arm).toBe("'none'");
      expect(csp.get("base-uri"), arm).toBe("'none'");
      expect([...csp.values()].join(" "), arm).not.toContain("http:");
    }
  }
});

test("the built document applies the clamps itself, so hostile tokens never reach the served bytes", () => {
  const document = buildCardFrameDocument({
    ...CONTENT,
    themeTokens: HOSTILE_THEME_TOKENS,
    styleTokens: HOSTILE_STYLE_TOKENS,
    fontFamily: HOSTILE_FONT_FAMILY,
  });
  for (const smuggled of ["__pwned", "url(//evil", "calc(", "not-a-custom-prop", "--accent:", "--sandbox-accent", "--sandbox-radius"]) {
    expect(document, smuggled).not.toContain(smuggled);
  }
  // The style block closes once and the height script is the only script, so nothing broke out of the <style>.
  expect(document.split("</style>")).toHaveLength(2);
  expect(document.split("<script")).toHaveLength(2);
  // Surviving-value controls: the clamp drops per field, not the whole slice.
  expect(document).toContain("--safe: #336699;");
  expect(document).toContain("--ok: 12px;");
  expect(document).toContain("font-family: sans-serif;");
});

test("external media widens exactly img-src and media-src to https", () => {
  const floor = directives(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static"));
  const widened = directives(buildCardFrameCsp({ ...CARD_FRAME_SAFE_FLOOR, allowExternalMedia: true }, "document", "static"));
  expect([...floor.values()].join(" ")).not.toContain("https:");
  const moved = [...widened].filter(([name, sources]) => floor.get(name) !== sources).map(([name]) => name);
  expect(moved).toEqual(MEDIA_DIRECTIVES);
  for (const name of MEDIA_DIRECTIVES) {
    expect(widened.get(name)).toContain("https:");
  }
});

test("hostile theme, style and font values are dropped per field while the safe ones survive", () => {
  expect(clampCardFrameThemeTokens(HOSTILE_THEME_TOKENS)).toEqual({ "--safe": "#336699" });
  expect(clampCardFrameStyleTokens({ ...HOSTILE_STYLE_TOKENS, "--mono": "'Geist Mono', ui-monospace, monospace" })).toEqual({
    "--ok": "12px",
    "--mono": "'Geist Mono', ui-monospace, monospace",
  });
  expect(clampCardFrameFontFamily(HOSTILE_FONT_FAMILY)).toBeUndefined();
  expect(clampCardFrameFontFamily("Geist, sans-serif")).toBe("Geist, sans-serif");
});
