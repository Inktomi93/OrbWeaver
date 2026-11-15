import { createHash } from "node:crypto";
import type { CardFrameHeight } from "@orb/kit/card-frame";
import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_MISSING_ATTRIBUTE,
  CARD_FRAME_SAFE_FLOOR,
  CARD_FRAME_SANDBOX,
  CARD_FRAME_SHRINK_BURST,
  CARD_FRAME_SHRINK_REFILL_MS,
  CARD_FRAME_STYLE_TOKEN,
  CARD_FRAME_THEME_TOKEN_LIMITS,
  clampCardFrameFontFamily,
  clampCardFrameRootAttributes,
  clampCardFrameStyleTokens,
  clampCardFrameThemeTokens,
  foldCardFrameHeight,
  readCardFrameLink,
  readCardFrameMissing,
} from "@orb/kit/card-frame";
import { expect, test } from "@orb/testkit/node";

const CONTENT = {
  html: "<p>card</p>",
  css: undefined,
  themeTokens: undefined,
  styleTokens: undefined,
  fontFamily: undefined,
  rootAttributes: undefined,
} as const;
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
const MONO_FAMILY = "'Geist Mono', ui-monospace, monospace";
const HOSTILE_STYLE_TOKENS = {
  [CARD_FRAME_STYLE_TOKEN.radius]: "8px} </style><script>window.__pwned=1</script>",
  [CARD_FRAME_STYLE_TOKEN.rootSize]: "calc(100% - 2px)",
  "--fetch": "url(//evil.test/x.png)",
  // A color has no place in the non-color slot: the two grammars must stay disjoint.
  "--sandbox-accent": "#336699",
  // A well-formed length under a name outside the slice: the slice is closed, so the name alone drops it.
  "--ok": "12px",
  [CARD_FRAME_STYLE_TOKEN.monoFamily]: MONO_FAMILY,
};
const HOSTILE_FONT_FAMILY = "Geist; } body { background: url(//evil) } /*";
// Each opens a CSS string that runs to the end of the one-line <style>, swallowing every rule after it.
const UNBALANCED_FAMILIES = ['a"', "'Geist Mono", "Geist Mono'", "'Geist Mono\", mono", '"a"b"', "'a' b", "Geist, 'Mono"];
// Font stacks the app and its pickable themes actually emit: quoted multi-word names and bare keyword sequences.
const SHIPPED_FAMILIES = [MONO_FAMILY, "Geist, ui-sans-serif, system-ui, sans-serif", "'Times New Roman', serif", '"Iowan Old Style", serif'];

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
  for (const smuggled of ["__pwned", "url(//evil", "calc(", "not-a-custom-prop", "--accent:", "--sandbox-accent", "--ok", CARD_FRAME_STYLE_TOKEN.radius]) {
    expect(document, smuggled).not.toContain(smuggled);
  }
  // The style block closes once and the height script is the only script, so nothing broke out of the <style>.
  expect(document.split("</style>")).toHaveLength(2);
  expect(document.split("<script")).toHaveLength(2);
  // Surviving-value controls: the clamp drops per field, not the whole slice.
  expect(document).toContain("--safe: #336699;");
  expect(document).toContain(`${CARD_FRAME_STYLE_TOKEN.monoFamily}: ${MONO_FAMILY};`);
  expect(document).toContain("font-family: sans-serif;");
});

test("a font-family list with an unbalanced or stray quote is refused by both font readers; shipped stacks pass", () => {
  for (const family of UNBALANCED_FAMILIES) {
    expect(clampCardFrameFontFamily(family), family).toBeUndefined();
    expect(clampCardFrameStyleTokens({ [CARD_FRAME_STYLE_TOKEN.monoFamily]: family }), family).toEqual({});
  }
  for (const family of SHIPPED_FAMILIES) {
    expect(clampCardFrameFontFamily(family), family).toBe(family);
    expect(clampCardFrameStyleTokens({ [CARD_FRAME_STYLE_TOKEN.monoFamily]: family }), family).toEqual({ [CARD_FRAME_STYLE_TOKEN.monoFamily]: family });
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
  expect(clampCardFrameThemeTokens(HOSTILE_THEME_TOKENS)).toEqual({ "--safe": "#336699" });
  expect(clampCardFrameStyleTokens({ ...HOSTILE_STYLE_TOKENS, [CARD_FRAME_STYLE_TOKEN.rootSize]: "125%" })).toEqual({
    [CARD_FRAME_STYLE_TOKEN.monoFamily]: MONO_FAMILY,
    [CARD_FRAME_STYLE_TOKEN.rootSize]: "125%",
  });
  expect(clampCardFrameFontFamily(HOSTILE_FONT_FAMILY)).toBeUndefined();
  expect(clampCardFrameFontFamily("Geist, sans-serif")).toBe("Geist, sans-serif");
});

test("the theme slice carries a whole resolved token set: colours, plain lengths and font lists, never a URL or a break-out", () => {
  const resolved = {
    "--any-colour": "oklch(0.72 0.175 52)",
    "--any-length": "0.5rem",
    "--any-font-list": "Geist, ui-sans-serif, system-ui, sans-serif",
    "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.2)",
    "--image": "url(https://evil.test/x.png)",
    "--break": "1px; } body { background: red",
  };
  expect(clampCardFrameThemeTokens(resolved)).toEqual({
    "--any-colour": "oklch(0.72 0.175 52)",
    "--any-length": "0.5rem",
    "--any-font-list": "Geist, ui-sans-serif, system-ui, sans-serif",
  });
});

test("the theme slice keeps to the token limits the mint parses with, so a clamped set is never refused whole", () => {
  const { count, nameChars } = CARD_FRAME_THEME_TOKEN_LIMITS;
  const longName = `--${"n".repeat(nameChars - 1)}`;
  const many = Object.fromEntries(Array.from({ length: count + 1 }, (_, index) => [`--t${index}`, "#336699"]));
  expect(clampCardFrameThemeTokens({ [longName]: "#336699", "--ok": "#336699" })).toEqual({ "--ok": "#336699" });
  expect(Object.keys(clampCardFrameThemeTokens(many))).toHaveLength(count);
});

test("a frame reports a missing handle only from a document whose root carries the miss attribute", () => {
  const missing = buildCardFrameDocument({ ...CONTENT, rootAttributes: { [CARD_FRAME_MISSING_ATTRIBUTE]: "" } });
  expect(missing).toContain(`<html ${CARD_FRAME_MISSING_ATTRIBUTE}="">`);
  // The pinned script reads the attribute by the same name the server writes.
  expect(missing).toContain(`hasAttribute("${CARD_FRAME_MISSING_ATTRIBUTE}")`);
  expect(readCardFrameMissing({ orbCardFrameMissing: true })).toBe(true);
  for (const garbage of [null, true, { orbCardFrameMissing: "true" }, { orbCardFrameHeight: 40 }]) {
    expect(readCardFrameMissing(garbage), JSON.stringify(garbage)).toBe(false);
  }
});

test("a framed link reaches the host only as an absolute http, https or mailto address", () => {
  expect(readCardFrameLink({ orbCardFrameLink: "https://example.test/a?b=1#c" })).toBe("https://example.test/a?b=1#c");
  expect(readCardFrameLink({ orbCardFrameLink: "http://example.test/" })).toBe("http://example.test/");
  expect(readCardFrameLink({ orbCardFrameLink: "mailto:someone@example.test" })).toBe("mailto:someone@example.test");
  for (const refused of ["javascript:alert(1)", "data:text/html,x", "blob:https://example.test/1", "/relative/path", "", "not a url"]) {
    expect(readCardFrameLink({ orbCardFrameLink: refused }), refused).toBeUndefined();
  }
  for (const garbage of [null, "https://example.test/", { orbCardFrameLink: 7 }, { orbCardFrameHeight: 40 }]) {
    expect(readCardFrameLink(garbage), JSON.stringify(garbage)).toBeUndefined();
  }
});

test("a reply frame folds its height against its own cap, far above a card's", () => {
  const card = foldCardFrameHeight(undefined, { orbCardFrameHeight: Number.MAX_SAFE_INTEGER })?.px;
  const reply = foldCardFrameHeight(undefined, { orbCardFrameHeight: Number.MAX_SAFE_INTEGER }, "reply")?.px;
  expect(card).toBeDefined();
  expect(reply).toBeGreaterThan(card ?? Number.POSITIVE_INFINITY);
  const tall = (card ?? 0) * 10;
  expect(foldCardFrameHeight(undefined, { orbCardFrameHeight: tall }, "reply")?.px).toBe(tall);
});

// Each report in order, at its time on the caller's clock; the heights the frame applies after each.
function applied(cap: "card" | "reply", reports: readonly (readonly [px: number, atMs: number])[]): readonly (number | undefined)[] {
  let height: CardFrameHeight | undefined;
  return reports.map(([px, atMs]) => {
    height = foldCardFrameHeight(height, { orbCardFrameHeight: px }, cap, atMs);
    return height?.px;
  });
}

test("a card frame never shrinks after its first report, which may be smaller than any seed", () => {
  expect(
    applied("card", [
      [300, 0],
      [200, 10_000],
      [400, 10_001],
      [100, 60_000],
    ]),
  ).toEqual([300, 300, 400, 400]);
});

test("a reply frame follows its content down as well as up, within its shrink burst", () => {
  expect(
    applied("reply", [
      [900, 0],
      [400, 1],
      [800, 2],
      [300, 3],
    ]),
  ).toEqual([900, 400, 800, 300]);
});

test("a reply frame whose height alternates every frame is held to one shrink per refill once its burst is spent", () => {
  const reports: (readonly [number, number])[] = [];
  for (let frame = 0; frame < 120; frame += 1) {
    reports.push([frame % 2 === 0 ? 900 : 400, frame * 16]);
  }
  const heights = applied("reply", reports);
  const shrinks = heights.filter((px, index) => index > 0 && px !== undefined && px < (heights[index - 1] ?? 0)).length;
  // About two seconds of frames: the burst, then at most one refill.
  const window = (reports.at(-1)?.[1] ?? 0) - (reports[0]?.[1] ?? 0);
  expect(shrinks).toBeLessThanOrEqual(CARD_FRAME_SHRINK_BURST.reply + Math.floor(window / CARD_FRAME_SHRINK_REFILL_MS));
  expect(heights.at(-1)).toBe(900);
});

test("a reply frame's spent burst refills with time, so a drawer closed later still shrinks it", () => {
  const spend: (readonly [number, number])[] = [[900, 0]];
  for (let step = 1; step <= 10; step += 1) {
    spend.push([900 - step * 10, step], [900, step]);
  }
  const later = (spend.at(-1)?.[1] ?? 0) + CARD_FRAME_SHRINK_REFILL_MS;
  expect(applied("reply", [...spend, [500, later]]).at(-1)).toBe(500);
});

test("a framed reply mirrors only plain data channels on its root, and its styles stay inline only", () => {
  const document = buildCardFrameDocument({
    ...CONTENT,
    rootAttributes: { "data-theme": "dusk", "data-skin": "moonlit", onload: "x", "data-evil": '"><script>', "data-UPPER": "x" },
  });
  expect(document).toContain('<html data-theme="dusk" data-skin="moonlit">');
  for (const smuggled of ["onload", "data-evil", "data-UPPER", "<link"]) {
    expect(document, smuggled).not.toContain(smuggled);
  }
  for (const delivery of ["document", "meta"] as const) {
    expect(directives(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, delivery, "static")).get("style-src"), delivery).toBe("'unsafe-inline'");
  }
  expect(clampCardFrameRootAttributes(null)).toEqual({});
});
