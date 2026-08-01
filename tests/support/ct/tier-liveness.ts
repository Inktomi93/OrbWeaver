// The per-PANE half of the density-tier liveness probe (density-pass-spec.md §4.2/§5.3, side-eye P1-3).
//
// `tests/ui/density-tier.suite.ct.tsx` proves the MECHANISM (strip `data-surface-tier` and every mapped
// value moves). That says nothing about whether a real pane still DECLARES the tier — a deleted `<Surface>`
// wrapper, a pane re-homed under a different shell, or a row rendered through a portal all leave the
// mechanism green and the pane un-tiered, which is exactly how S5's retune got mistaken for a live tier
// map in the first place. So each LIST pane's own CT asserts the tier is resolving IN THAT PANE, from
// computed values: the row title sits at the `label` step, not the tier-less `body` default it falls back
// to. Read from the same document, never a hardcoded px.
import { expect } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

const TITLE = '[data-slot="list-row-title"]';

/** The px `--text-label` / `--text-body` resolve to in the live CT document, plus the row title's own
 *  computed size and weight. One page round-trip. */
function readTierProof(pane: Locator): Promise<{ size: string; weight: string; label: string; body: string }> {
  return pane.evaluate((node, titleSlot) => {
    const title = node.querySelector<HTMLElement>(titleSlot);
    if (title === null) {
      throw new Error("tier-liveness: the pane rendered no list-row title to measure");
    }
    const probe = node.ownerDocument.createElement("div");
    node.ownerDocument.body.append(probe);
    const at = (token: string): string => {
      probe.style.fontSize = `var(${token})`;
      return getComputedStyle(probe).fontSize;
    };
    const label = at("--text-label");
    const body = at("--text-body");
    probe.remove();
    const style = getComputedStyle(title);
    return { size: style.fontSize, weight: style.fontWeight, label, body };
  }, TITLE);
}

/** Asserts THIS pane resolves the instrument tier: its row titles are the mapped `label` step at the
 *  mock's 600 weight, and NOT the tier-less `body` default a pane that lost its `<Surface>` falls back to. */
export async function expectInstrumentTierLive(pane: Locator): Promise<void> {
  const proof = await readTierProof(pane);
  expect(proof.size, "the row title must resolve the instrument tier's --text-label step").toBe(proof.label);
  expect(proof.size, "a tier-less pane falls back to --text-body — this pane lost its <Surface>").not.toBe(proof.body);
  expect(proof.weight).toBe("600");
}
