// CT kit — THE INK-TO-INK VOID of a library row, and the one home for that measurement.
//
// Minted in `tests/client/features/tag/components/tag-collection-rows.ct.tsx` for #1824 and lifted here
// unchanged when #1838 needed the same matrix on the roster rows. The
// approved config-collections design makes this measurement owed by EVERY
// collection row — "Rows at pane width carry more air than at 307px — the width matrix (both ends + the
// crossover, both pointers) is owed before the row anatomy is called converged" — and the mock review set
// the bar at ≤ 25%. A second copy of the walk is how two rows would come to be judged by two rules.
//
// IT IS A RANGE, NEVER A BOUNDING BOX, and that is the whole reason the defect survived two reviews. A row
// title is `min-w-0 flex-1 truncate`, so its BOX spans nearly the whole row and a `getBoundingClientRect`
// census reports a 6px gap and a clean row — the retracted first pass of the 2026-09-06 side-eye did
// exactly that and read 1% where the truth was 86%. Only `Range.selectNodeContents(textNode)` sees where
// the glyphs actually are.
import type { Page } from "@playwright/test";

export interface InkVoid {
  /** The row's own width, px — carried so a failure message can say WHICH width arm broke. */
  readonly width: number;
  /** The widest gap between consecutive glyph runs, as a percentage of that width. */
  readonly pct: number;
  /** The two runs the gap sits between, quoted — a percentage with no `"name" → "count"` is unactionable. */
  readonly at: string;
  /** How many inked runs were found. ZERO means the walk saw nothing, which is never a clean row. */
  readonly runs: number;
}

/** One row's ink-to-ink void: the widest horizontal gap between consecutive rendered GLYPH RUNS, as a
 *  fraction of the row's own width. Text nodes only — an invisible hover-revealed kebab is not ink, and a
 *  colour swatch is not ink either.
 *
 *  `index` selects among the page's `[data-slot="list-row-root"]` elements and THROWS when there is none
 *  there: a missing row must fail loudly rather than return a comfortable zero. */
export function inkVoid(page: Page, index: number): Promise<InkVoid> {
  return page.evaluate((at: number) => {
    const row = document.querySelectorAll<HTMLElement>('[data-slot="list-row-root"]')[at];
    if (row === undefined) {
      throw new Error(`inkVoid: no row at index ${String(at)}`);
    }
    const inked = (node: Node): boolean => {
      const parent = node.parentElement;
      if (parent === null || (node.textContent ?? "").trim() === "") {
        return false;
      }
      const style = getComputedStyle(parent);
      return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    };
    const runRect = (node: Node): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode: (node): number => (inked(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const runs: { readonly left: number; readonly right: number; readonly text: string }[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const rect = runRect(node);
      runs.push({ left: rect.left, right: rect.right, text: (node.textContent ?? "").trim() });
    }
    runs.sort((a, b) => a.left - b.left);
    const width = row.getBoundingClientRect().width;
    const widest = runs
      .slice(1)
      .map((run, i) => ({ gap: run.left - (runs[i]?.right ?? run.left), at: `"${runs[i]?.text ?? ""}" → "${run.text}"` }))
      .reduce((best, candidate) => (candidate.gap > best.gap ? candidate : best), { gap: 0, at: "" });
    return { width: Math.round(width), pct: Math.round((widest.gap / width) * 100), at: widest.at, runs: runs.length };
  }, index);
}

/** The bar the mock review set for a library row, in percent of the row's width (the mock design §5.6). */
export const INK_VOID_BAR_PCT = 25;

/** The three widths the matrix is taken at: 382 is the coarse arm's real row width inside a 430px phone,
 *  990 the desktop CONTENT pane with the context rail collapsed, 660 the crossover between them. A POINT
 *  measurement never proves a range property — the same tag row read 48% at the narrow end while the wide
 *  end read 86%, so either end alone would have been a false verdict about the other. */
export const INK_VOID_WIDTHS = [382, 660, 990] as const;
