// CT: the shared capped-field COUNTER (side-eye PROSE-LIMIT P3/P4) — the one home for "how a character cap
// is drawn", so the prose settings cards, the preset template drill-in and the format-string rows cannot
// drift into three spellings of it again. Three arms: quiet under the threshold, live at it, and DANGER-toned
// once past the cap — that last one is the whole finding: the count sat muted grey beside its own red
// refusal, on the one surface where the number IS the refusal.
//
// A CT rather than a unit test: the arms differ by COMPUTED COLOR, which only a real render resolves (the
// token is an oklch custom property, not a class name a snapshot could compare).

import { CappedFieldCounter } from "@orb/client/forms/editor";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

const MAX = 4000;

test("quiet under 80% of the cap, live at it, danger-toned past it", async ({ mount }) => {
  // 79.9% — nothing. An always-on counter is chrome; the affordance IS its lateness.
  const component = await mount(<CappedFieldCounter length={MAX * 0.8 - 1} max={MAX} />);
  await expect(component).toBeEmpty();

  // At the threshold it appears, reading the live length against the cap.
  await component.unmount();
  const at = await mount(<CappedFieldCounter length={MAX * 0.8} max={MAX} />);
  await expect(at).toHaveText(`${String(MAX * 0.8)}/${String(MAX)}`);
  await expect.poll(async () => await at.evaluate((el) => getComputedStyle(el).color)).not.toBe(resolvedTokenColor("color.destructive"));

  // PAST the cap — the only way to get here is text that ARRIVED over-cap (an import, an older blob), which
  // is exactly the state whose save is being refused. The number is part of that refusal.
  await at.unmount();
  const over = await mount(<CappedFieldCounter length={MAX + 499} max={MAX} />);
  await expect(over).toHaveText(`${String(MAX + 499)}/${String(MAX)}`);
  await expect(over).toHaveCSS("color", resolvedTokenColor("color.destructive"));
});

test("the threshold is a prop, so a caller with its own contract-stated fraction keeps it", async ({ mount }) => {
  const component = await mount(<CappedFieldCounter counterAt={0.5} length={MAX * 0.5} max={MAX} />);
  await expect(component).toHaveText(`${String(MAX * 0.5)}/${String(MAX)}`);
});
