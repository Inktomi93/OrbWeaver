// The QUALITY censuses' two #1317 corrections, proven through the real CLI against a file:// fixture.
//
// WHY THIS TIER. Both live inside COLLECT_SAMPLES_JS — a hand-written JS string evaluated in a browser —
// so nothing below the CLI can reach them, and both are about what the walker SELECTS rather than about
// arithmetic a unit test could fold. The observable is the findings table, which is what a reader of a
// design-audit actually reads.
//
// ITEM 5 — A FINDING'S SELECTOR MUST BE LOCATABLE. `checkHeadingOrder` minted `selector: "h3"`: the TAG,
// not the element. cli.ts's own contract is that every finding carries a selector a reader can paste into
// the page, and "h3" addresses every h3 on the surface. The walker holds the element and already spends
// `describe()` on every other family, so the fix is one call.
//
// ITEM 7 — THE #552 SHAPE, IN BOTH DIRECTIONS AT ONCE. `VIEWPORT_IDENT_RE` word-boundary-tested the
// element's CLASS + ID for "preview"/"viewport"/"carousel"/…, to skip containers whose clipping is the
// point. Measured on this tree 2026-09-04: ZERO className strings in packages/{ui,client} carry any of
// those words, while packages/ui names every such container with `data-slot` (scroll-area-viewport,
// dialog-viewport, menu-viewport, virtual-list-viewport, media-grid-viewport, …). So the test was BLIND
// to the real expression mechanism AND latently false-positive against any Tailwind utility containing
// the word — tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md row 8's class. The two arms below are the two directions.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, findingSelectors, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

interface AuditRuleProof {
  readonly rule: string;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

interface ToolContext {
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly scratch: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: (context: ToolContext) => Promise<void>): void {
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

async function auditStdout(scratch: string, runCli: ToolContext["runCli"], name: string, body: string): Promise<string> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return res.stdout;
}

// ── item 5: the skipped heading names ITSELF ─────────────────────────────────

auditRuleTest(
  [
    {
      rule: "skipped-heading",
      kind: "fires",
      reason:
        "an h1 followed by an h3 skips h2 — and the finding must name the OFFENDING element (#recent-heading), not the tag `h3`, which addresses every h3 on the surface",
    },
  ],
  "a skipped heading is reported against a locatable selector, never the bare tag",
  async ({ runCli, scratch }) => {
    const body = '<h1 id="library-heading">Library</h1><h3 id="recent-heading">Recent</h3>';
    const selectors = findingSelectors(await auditStdout(scratch, runCli, "heading-selector", body), "skipped-heading");
    // The walker anchors a unique id, so the offender is locatable — and the bare tag "h3" is exactly
    // what this may never be again.
    expect(selectors).toEqual(["#recent-heading"]);
  },
);

// ── item 7: the clip-container exemption reads the SLOT, not the class string ──

/** A hard clip with a control spilling 40px past its LEFT edge — unreachable content whatever the
 *  overflow value says, which is the per-side law census-quality.ts states. */
function clippedCarrier(id: string, marker: string): string {
  return `<div id="${id}" ${marker} style="overflow:hidden;width:120px;height:60px;position:relative">
  <button style="position:absolute;left:-40px;top:8px;width:70px;height:24px">Go now</button>
</div>`;
}

/** Base UI's `visuallyHidden` posture, verbatim from the vendor
 *  (`@base-ui/utils/visuallyHidden.js`: `clipPath: inset(50%)`, `overflow: hidden`, `position: fixed`,
 *  `top/left: 0`), plus the `width/height: 100%` `SliderThumb` gives its real `<input type=range>`. That
 *  combination is a VIEWPORT-SIZED rect that paints not one pixel — the authored idiom this rule kept
 *  convicting, not a hand-built shape that merely satisfies `isVisuallyHidden`. */
const VISUALLY_HIDDEN_INPUT_STYLE =
  "position:fixed;top:0;left:0;width:100%;height:100%;clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0;padding:0;margin:-1px";

auditRuleTest(
  [
    {
      rule: "clipped-overflow",
      kind: "fires",
      reason:
        "a container whose CLASS merely contains the word `preview` is not a carousel viewport — the old ident regex skipped it wholesale, so a real cut control on any element carrying such a utility class read clean",
    },
    {
      rule: "clipped-overflow",
      kind: "silent",
      reason:
        "a `data-slot=scroll-area-viewport` container IS the app's authored clipping viewport (packages/ui/src/primitives/scroll-area), where clipping is the point — and the old class-only test could not see that slot at all",
    },
  ],
  "the clip exemption follows the authored data-slot, not a word inside a Tailwind class string",
  async ({ runCli, scratch }) => {
    const body = `${clippedCarrier("clip-class", 'class="preview-pane rounded-md"')}${clippedCarrier("clip-slot", 'data-slot="scroll-area-viewport"')}`;
    const cuts = findingSelectors(await auditStdout(scratch, runCli, "clip-exemption", body), "clipped-overflow");
    // One and only one: the class-word coincidence is judged (it was silently skipped before), and the
    // authored viewport slot is exempt (it was invisible to the old class-only test, so it was judged).
    expect(cuts).toEqual(["#clip-class"]);
  },
);

// ── #1783: the POSITIONED arm applies the SAME paint fence the in-flow arm applies ────────────

auditRuleTest(
  [
    {
      rule: "clipped-overflow",
      kind: "silent",
      reason:
        "a Base UI Slider's real <input type=range> is `visuallyHidden` at position:fixed sized 100%/100% — a viewport-sized rect that paints ZERO pixels, so its 'spill' past any clipping container is arithmetic about a box nobody can see. The rule's POSITIONED arm never called isVisuallyHidden (the in-flow arm always did), which minted a P2 for every Slider inside a clipping container app-wide (#1770 measured 'clips Temperature right by 383px' on Presets → Default)",
    },
    {
      rule: "clipped-overflow",
      kind: "fires",
      reason:
        "the planted positive control in the SAME run: a genuinely clipped positioned button in an identical container. A fence that also silenced this would have traded a false positive for a false clean, and a zero from a dead collector reads exactly like a fixed one",
    },
  ],
  "a visually-hidden positioned child cuts nothing — the paint fence is the same one the in-flow arm applies",
  async ({ runCli, scratch }) => {
    // The two containers differ ONLY in what they hold: same overflow, same size, same position — so the
    // negative arm is a true control rather than a differently-shaped document (tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md row 14).
    const body = `<div id="clip-hidden" style="overflow:hidden;width:120px;height:60px;position:relative">
  <input type="range" aria-label="Temperature" style="${VISUALLY_HIDDEN_INPUT_STYLE}">
</div>${clippedCarrier("clip-real", "")}`;
    const cuts = findingSelectors(await auditStdout(scratch, runCli, "clip-visually-hidden", body), "clipped-overflow");

    expect(cuts).toEqual(["#clip-real"]);
  },
);
