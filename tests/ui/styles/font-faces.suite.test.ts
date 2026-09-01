// The app-face pin (client-architecture-lockdown.md §4.3 — an authored CSS mechanism carries a test).
//
// WHY THIS EXISTS: the font.sans / font.mono token stacks named "Geist" / "Geist Mono" for the app's
// whole life while NO @font-face was ever shipped, so every surface silently painted the ui-sans-serif
// fallback and nothing was red. A declared face nobody registers is invisible to every static gate —
// the family string is the only coupling between the token vault and the registration, and a rename on
// either side reintroduces the exact same silent fallback. So this suite proves the coupling itself:
//   1. every non-generic family the tokens name is registered by an @font-face in ui globals, and
//   2. every registered face's src resolves to a real vendored asset on disk (a moved/deleted woff2 is
//      a 404 at runtime and a fallback repaint — invisible to tsc, biome and the CSS home gates), and
//   3. the loading contract stays swap + a variable weight range (no invisible text, no synthetic bold).
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "../../support/fixtures.ts";

const UI_STYLES = join(import.meta.dirname, "../../../packages/ui/src/styles");
const GLOBALS_CSS_PATH = join(UI_STYLES, "globals.css");
const TOKENS_PATH = join(import.meta.dirname, "../../../packages/ui/src/tokens/tokens.json");
const COMMENT_RE = /\/\*[\s\S]*?\*\//gu;
const FACE_RE = /@font-face\s*\{(?<body>[^}]*)\}/gu;
const DECLARATION_RE = /(?<property>[\w-]+)\s*:\s*(?<value>[^;]+);/gu;
const URL_RE = /url\(\s*['"]?(?<href>[^'")]+)['"]?\s*\)/u;
// A generic CSS family keyword is the FALLBACK tail of a stack — it names no shippable face, so it is
// never something this repo could register. Everything before it is a real face we must have shipped.
const GENERIC_FAMILIES = new Set(["ui-sans-serif", "system-ui", "sans-serif", "ui-monospace", "SFMono-Regular", "monospace"]);

interface FontFace {
  readonly family: string;
  readonly style: string;
  readonly weight: string;
  readonly display: string;
  readonly src: string;
}

function readFaces(): readonly FontFace[] {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  return [...css.matchAll(FACE_RE)].map((face) => {
    const declarations = new Map<string, string>();
    for (const declaration of (face.groups?.["body"] ?? "").matchAll(DECLARATION_RE)) {
      declarations.set(declaration.groups?.["property"] ?? "", (declaration.groups?.["value"] ?? "").trim());
    }
    return {
      family: (declarations.get("font-family") ?? "").replace(/^['"]|['"]$/gu, ""),
      style: declarations.get("font-style") ?? "",
      weight: declarations.get("font-weight") ?? "",
      display: declarations.get("font-display") ?? "",
      src: declarations.get("src") ?? "",
    };
  });
}

function tokenFaces(): readonly string[] {
  const tokens: unknown = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
  const font = (tokens as { font: Record<string, { $value: readonly string[] }> }).font;
  return Object.values(font)
    .flatMap((entry) => entry.$value)
    .filter((family) => !GENERIC_FAMILIES.has(family));
}

test("every non-generic family the tokens declare is actually registered by an @font-face", () => {
  const declared = tokenFaces();
  // THE STALE ARM: if the token shape ever moves, an empty expectation set would pass vacuously.
  expect(declared.length, "font.sans + font.mono must name at least one shippable face").toBeGreaterThan(0);
  const registered = new Set(readFaces().map((face) => face.family));
  for (const family of declared) {
    expect(registered.has(family), `token stack names "${family}" but ui globals registers no such @font-face — the app would paint the fallback`).toBe(true);
  }
});

test("every registered face resolves to a vendored asset on disk", () => {
  const faces = readFaces();
  expect(faces.length, "ui globals must register the app faces").toBeGreaterThan(0);
  for (const face of faces) {
    const href = URL_RE.exec(face.src)?.groups?.["href"];
    expect(href, `@font-face for "${face.family}" must carry a url() src`).toBeDefined();
    const asset = resolve(dirname(GLOBALS_CSS_PATH), href ?? "");
    expect(statSync(asset, { throwIfNoEntry: false })?.isFile() ?? false, `${face.family} (${face.style}) points at a missing asset: ${asset}`).toBe(true);
  }
});

test("every registered face loads with swap and spans a variable weight range", () => {
  for (const face of readFaces()) {
    // swap: text paints immediately in the fallback and re-paints in Geist — never invisible.
    expect(face.display, `${face.family} (${face.style}) must not block or hide text while loading`).toBe("swap");
    // A single weight value would make every other weight a SYNTHETIC bolding of one cut.
    expect(face.weight, `${face.family} (${face.style}) must be the variable cut, not one static weight`).toMatch(/^\d+\s+\d+$/u);
  }
});
