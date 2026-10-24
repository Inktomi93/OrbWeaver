import { createHash } from "node:crypto";
import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_SAFE_FLOOR,
  clampCardFrameFontFamily,
  clampCardFrameStyleTokens,
  clampCardFrameThemeTokens,
} from "@orb/kit/card-frame";
import { expect, test } from "@orb/testkit/node";

const CONTENT = { html: "<p>card</p>", css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined } as const;
const MEDIA_DIRECTIVES = ["img-src", "media-src"];

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

test("no delivery or posture opens connect-src, and nothing admits plaintext http", () => {
  for (const delivery of ["document", "meta"] as const) {
    for (const posture of ["static", "interactive"] as const) {
      const csp = buildCardFrameCsp({ allowExternalMedia: true, allowInlineData: true }, delivery, posture);
      expect(directives(csp).has("connect-src"), `${delivery}/${posture}`).toBe(false);
      expect(directives(csp).get("default-src")).toBe("'none'");
      expect(csp).not.toContain("http:");
    }
  }
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
  expect(
    clampCardFrameThemeTokens({
      "--accent": "url(//evil.test/x.png)",
      "--evil": "red; } </style><script>window.__pwned=1</script>",
      "not-a-custom-prop": "#336699",
      "--safe": "#336699",
    }),
  ).toEqual({ "--safe": "#336699" });
  expect(
    clampCardFrameStyleTokens({
      "--sandbox-radius": "8px} </style><script>window.__pwned=1</script>",
      "--calc": "calc(100% - 2px)",
      "--fetch": "url(//evil.test/x.png)",
      // A color has no place in the non-color slot: the two grammars must stay disjoint.
      "--sandbox-accent": "#336699",
      "--ok": "12px",
      "--mono": "'Geist Mono', ui-monospace, monospace",
    }),
  ).toEqual({ "--ok": "12px", "--mono": "'Geist Mono', ui-monospace, monospace" });
  expect(clampCardFrameFontFamily("Geist; } body { background: url(//evil) } /*")).toBeUndefined();
  expect(clampCardFrameFontFamily("Geist, sans-serif")).toBe("Geist, sans-serif");
});
