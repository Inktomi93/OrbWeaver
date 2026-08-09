// Unit pins for the #42 streamed-word reveal plugin (docs/design/streaming-reveal-42.md): word
// wrapping + whitespace passthrough, the code/math skip guards, and the reveal-time age model —
// new words at delay 0, previously revealed words resuming at their true age, settled words clamped
// to the constant cap (byte-stable styles), and the shrink reset for a new tail block.

// Deep-imports src (browser package; @orb/ui is not node-resolvable), like dialogue.test.ts.
import { describe } from "vitest";
import { createRevealPlugin } from "../../../packages/ui/src/markdown/reveal-plugin.ts";
import { expect, test } from "../../support/fixtures.ts";

interface Node {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[], properties: Record<string, unknown> = {}): Node => ({ type: "element", tagName, properties, children });
const root = (children: Node[]): Node => ({ type: "root", children });

/** Every span-wrapped token in tree order, with its delay style. */
function spans(node: Node): Array<{ word: string; style: string }> {
  const out: Array<{ word: string; style: string }> = [];
  const walk = (n: Node): void => {
    if (n.type === "element" && n.properties?.["data-orb-reveal"] === true) {
      out.push({ word: n.children?.[0]?.value ?? "", style: String(n.properties["style"]) });
      return;
    }
    for (const child of n.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** Bare (unwrapped) text values remaining in the tree. */
function bareText(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node, inSpan: boolean): void => {
    if (n.type === "text" && !inSpan) {
      out.push(n.value ?? "");
      return;
    }
    const isSpan = n.type === "element" && n.properties?.["data-orb-reveal"] === true;
    for (const child of n.children ?? []) {
      walk(child, inSpan || isSpan);
    }
  };
  walk(node, false);
  return out;
}

function pluginAt(times: number[]): { run: (tree: Node) => void } {
  let call = 0;
  const { rehypePlugin } = createRevealPlugin(() => times[Math.min(call, times.length - 1)] ?? 0);
  const transform = rehypePlugin();
  return {
    run: (tree: Node): void => {
      transform(tree);
      call += 1;
    },
  };
}

describe("word wrapping", () => {
  test("every word becomes a reveal span; whitespace runs stay bare text", () => {
    const p = pluginAt([1000]);
    const tree = root([el("p", [text("two words here")])]);
    p.run(tree);
    expect(spans(tree).map((s) => s.word)).toEqual(["two", "words", "here"]);
    expect(bareText(tree)).toEqual([" ", " "]);
  });

  test("new words carry delay 0 (fade starts now)", () => {
    const p = pluginAt([1000]);
    const tree = root([el("p", [text("hi")])]);
    p.run(tree);
    expect(spans(tree)[0]?.style).toBe("animation-delay:-0ms");
  });

  test("code/pre and math-classed subtrees are never wrapped (their engines re-read the raw text)", () => {
    const p = pluginAt([1000]);
    const tree = root([
      el("p", [text("prose "), el("code", [text("const x = 1")])]),
      el("pre", [el("code", [text("fence body")])]),
      el("span", [text("$x^2$")], { className: ["math", "math-inline"] }),
    ]);
    p.run(tree);
    expect(spans(tree).map((s) => s.word)).toEqual(["prose"]);
  });
});

describe("the reveal-time age model", () => {
  test("a re-run resumes previously revealed words at their true age; new words start at 0", () => {
    const p = pluginAt([1000, 1100]);
    const first = root([el("p", [text("alpha")])]);
    p.run(first);
    // 100ms later the block re-renders with a new word appended (fresh hast tree, as rehype gives us).
    const second = root([el("p", [text("alpha beta")])]);
    p.run(second);
    const got = spans(second);
    expect(got[0]).toEqual({ word: "alpha", style: "animation-delay:-100ms" });
    expect(got[1]).toEqual({ word: "beta", style: "animation-delay:-0ms" });
  });

  test("settled words clamp to the constant cap — style bytes stop changing (no attr churn)", () => {
    const p = pluginAt([1000, 2000, 3000]);
    p.run(root([el("p", [text("old")])]));
    const mid = root([el("p", [text("old fresh")])]);
    p.run(mid);
    expect(spans(mid)[0]?.style).toBe("animation-delay:-400ms");
    const late = root([el("p", [text("old fresh more")])]);
    p.run(late);
    // Same clamped bytes on the settled word across runs.
    expect(spans(late)[0]?.style).toBe("animation-delay:-400ms");
  });

  test("a shrink (new tail block / stream reset) resets the log — the fresh block's words fade anew", () => {
    const p = pluginAt([1000, 1050, 1100]);
    p.run(root([el("p", [text("a long first paragraph of words")])]));
    // The tail block advanced: this run sees a NEW short block (fewer chars than the watermark).
    const fresh = root([el("p", [text("New")])]);
    p.run(fresh);
    expect(spans(fresh)[0]?.style).toBe("animation-delay:-0ms");
    // And its growth keeps aging from ITS OWN reveal time.
    const grown = root([el("p", [text("New para")])]);
    p.run(grown);
    expect(spans(grown)[0]?.style).toBe("animation-delay:-50ms");
    expect(spans(grown)[1]?.style).toBe("animation-delay:-0ms");
  });
});
