import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const FLIP = "orb/no-unruled-flip-inversion";
const CLIENT = "packages/client/src/features/gallery/lib/probe.ts";
const TABS = "packages/ui/src/primitives/tabs/tabs.tsx";

const GLIDE = [
  "export function glide(node: HTMLElement, dx: number): void {",
  '  node.style.transitionProperty = "none";',
  "  node.style.transform = `translateX(${String(dx)}px)`;",
  "  node.getBoundingClientRect();",
  '  node.style.transform = "";',
  "}",
].join("\n");

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order (the first one also lives in the ruled home, asserted below).
  ["a glide outside the ruled home", GLIDE, "packages/ui/src/primitives/card/card.tsx", 1],
  [
    "a third member flushed through offsetWidth",
    "export function slide(el: HTMLElement, dx: number): void {\n  el.style.transform = `translateX(${String(dx)}px)`;\n  const w = el.offsetWidth;\n  void w;\n  el.style.transform = '';\n}",
    CLIENT,
    1,
  ],
  [
    "a computed write and a flush nested in a block",
    'export function slide(el: HTMLElement, dx: number): void {\n  el.style["transform"] = `translateX(${String(dx)}px)`;\n  if (dx > 0) {\n    void el.offsetHeight;\n  }\n  el.style["transform"] = "";\n}',
    CLIENT,
    1,
  ],
  // The retired gate's mustPass rows, in order.
  [
    "the other ruled member writes a data attribute and no transform",
    'export function useListTrackFlip(el: HTMLElement, open: boolean): void {\n  el.dataset["listFlip"] = open ? "in" : "out";\n  void el.offsetWidth;\n}',
    CLIENT,
    0,
  ],
  ["a transform write with no flush", 'export function park(el: HTMLElement): void {\n  el.style.transform = "translateY(0)";\n}', CLIENT, 0],
  [
    "a read before the write is measure-then-set",
    "export function measureThenSet(el: HTMLElement): void {\n  const width = el.offsetWidth;\n  el.style.transform = `scaleX(${String(width / 100)})`;\n}",
    CLIENT,
    0,
  ],
  [
    "a write and a read in two functions",
    "export function write(el: HTMLElement, dx: number): void {\n  el.style.transform = `translateX(${String(dx)}px)`;\n}\nexport function flush(el: HTMLElement): void {\n  void el.offsetWidth;\n}",
    CLIENT,
    0,
  ],
  [
    "a non-transform write flushed by a read",
    'export function opacity(el: HTMLElement): void {\n  el.style.opacity = "0";\n  void el.offsetWidth;\n}',
    CLIENT,
    0,
  ],
  // Spellings the retired reader followed.
  [
    "a same-file const key for the written property",
    'const KEY = "transform";\nexport function slide(el: HTMLElement): void {\n  el.style[KEY] = "scaleX(2)";\n  void el.offsetWidth;\n}',
    CLIENT,
    1,
  ],
  [
    "a let key never reassigned",
    'let KEY = "transform";\nexport function slide(el: HTMLElement): void {\n  el.style[KEY] = "scaleX(2)";\n  void el.offsetWidth;\n}',
    CLIENT,
    1,
  ],
  [
    "a reassigned let key names no one property",
    'let KEY = "opacity";\nKEY = "transform";\nexport function slide(el: HTMLElement): void {\n  el.style[KEY] = "scaleX(2)";\n  void el.offsetWidth;\n}',
    CLIENT,
    0,
  ],
  [
    "a const key for the style receiver",
    'const STYLE = "style";\nexport function slide(el: HTMLElement): void {\n  el[STYLE].transform = "scaleX(2)";\n  void el.offsetWidth;\n}',
    CLIENT,
    1,
  ],
  [
    "a const key for the flushing read",
    'const FLUSH = "offsetWidth";\nexport function slide(el: HTMLElement): void {\n  el.style.transform = "scaleX(2)";\n  void el[FLUSH];\n}',
    CLIENT,
    1,
  ],
  [
    "a string-literal style receiver",
    'export function slide(el: HTMLElement): void {\n  el["style"].transform = "scaleX(2)";\n  void el["offsetHeight"];\n}',
    CLIENT,
    1,
  ],
  [
    "an optional-chained flush",
    "export function slide(el: HTMLElement | null): void {\n  el.style.transform = 'scaleX(2)';\n  void el?.getBoundingClientRect();\n}",
    CLIENT,
    1,
  ],
  [
    "an arrow function owns its own window",
    "export const slide = (el: HTMLElement): void => {\n  el.style.transform = 'scaleX(2)';\n  void el.getBoundingClientRect;\n};",
    CLIENT,
    1,
  ],
  [
    "a method owns its own window",
    "export class Mover {\n  move(el: HTMLElement): void {\n    el.style.transform = 'scaleX(2)';\n    void el.offsetWidth;\n  }\n}",
    CLIENT,
    1,
  ],
  [
    "a read inside a nested callback does not flush the outer write",
    "export function write(el: HTMLElement): void {\n  el.style.transform = 'scaleX(2)';\n  queueMicrotask(() => {\n    void el.offsetWidth;\n  });\n}",
    CLIENT,
    0,
  ],
  [
    "a transform write on a plain object",
    "export function plain(box: { transform: string }): void {\n  box.transform = 'x';\n  void box.offsetWidth;\n}",
    CLIENT,
    0,
  ],
  ["the ruled tabs home", GLIDE, TABS, 0],
  // The home owns its one ruled pair, not the file: a second pair is a finding, and a home with no pair is stale.
  [
    "a second pair in the ruled tabs home",
    `${GLIDE}\nexport function slide(el: HTMLElement): void {\n  el.style.transform = 'scaleX(2)';\n  void el.offsetWidth;\n}`,
    TABS,
    1,
  ],
  [
    "a second pair spelled through a computed key in the tabs home",
    `${GLIDE}\nexport function slide(el: HTMLElement): void {\n  el.style["transform"] = 'scaleX(2)';\n  void el.offsetHeight;\n}`,
    TABS,
    1,
  ],
  ["a tabs home whose flush is gone is stale", GLIDE.replace("  node.getBoundingClientRect();\n", ""), TABS, 1],
  ["a tabs home that writes no transform is stale", "export const tabs = null;", TABS, 1],
  [
    "a measure-then-set beside the ruled pair in the tabs home",
    `${GLIDE}\nexport function measureThenSet(el: HTMLElement): void {\n  const width = el.offsetWidth;\n  el.style.transform = String(width);\n}`,
    TABS,
    0,
  ],
  ["the same two pairs in a sibling of the home", `${GLIDE}\n${GLIDE.replace("glide", "glide2")}`, "packages/ui/src/primitives/tabs/tabs-other.tsx", 2],
  ["the server package is outside the population", GLIDE, "packages/server/src/probe.ts", 0],
] as const) {
  test(`native flip inversion ${name}`, { timeout: 60_000 }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, FLIP, source, path)).toHaveLength(count);
  });
}
