// THE OVERLAY-SURFACE EXEMPTION IS A ROLE TEST (#1317 item 7 — the #552 shape), proven through the real
// CLI against a file:// fixture.
//
// `isExcludedCardContext` (ops/walker/census-decor.ts) drops a candidate that IS a popup surface, because
// a dropdown/menu/dialog panel painted inside another panel is not a card-in-card. It asked that question
// of a word list — `/\b(dropdown|popover|tooltip|menu|modal|dialog)\b/i` — tested against `el.className`
// AND against `role`. The class arm is the defect: any Tailwind utility CONTAINING one of those words
// (`menu-panel`, `dialog-body`, `popover-anchor`) silenced the rule on a genuine nested card, which is a
// FALSE CLEAN on an instrument the owner reads daily. The role arm was merely a loose spelling of an
// exact match, and it missed `alertdialog`, `menubar`, `listbox`, the native `popover` attribute and the
// `<dialog>` element entirely.
//
// The replacement is `el.matches(OVERLAY_SURFACE_SELECTOR)` (ops/walker/core.ts) — the ARIA role the app's
// only interactive-primitive vendor actually publishes. SELF-scoped, exactly as the regex was: a card
// nested inside a dialog BODY is a real nesting defect, and widening this to `closest()` would trade a
// false positive for a false clean.
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

/** Border + radius + fill on both boxes: `isCardLike` for the inner, `hasEnclosingBox` for the outer. The
 *  inner carries enough text and box to clear the small-chip exclusion the same predicate applies. */
const CARD = "border:1px solid #555;border-radius:8px;background:#1b1b1b";

auditRuleTest(
  [
    {
      rule: "nested-card",
      kind: "fires",
      reason:
        "a decorative panel nested in a panel is the rule's real target, and a Tailwind class that merely CONTAINS the word `menu` is not a menu — the old class-string regex silenced it, which is a false clean on the instrument the owner reads daily",
    },
    {
      rule: "nested-card",
      kind: "silent",
      reason:
        "a real `role=menu` popup surface painted inside a card is a floating layer, not a card-in-card — the exemption survives the rewrite, now keyed on the ARIA role the app actually publishes",
    },
  ],
  "the popup exemption follows the ARIA role, not a word inside a Tailwind class string",
  async ({ runCli, scratch }) => {
    const body = `<div id="outer-card" style="${CARD};padding:16px;width:420px">
  <div id="inner-classword" class="menu-panel px-2" style="${CARD};width:200px;height:80px">nested panel body</div>
  <div id="inner-realmenu" role="menu" style="${CARD};width:200px;height:80px">nested panel body</div>
</div>`;
    await writeFile(join(scratch, "overlay-exemption.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "overlay-exemption.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

    // One and only one: the class-word coincidence is judged (it was silently exempt before), and the
    // real popup role stays exempt — the rewrite must not trade one error for the other.
    expect(findingSelectors(res.stdout, "nested-card")).toEqual(["#inner-classword"]);
  },
);

/** A rounded box wearing a dominant 3px chromatic left edge — the exact geometry of both §6 accent-border
 *  bans, and the exact geometry the chat-style picker's mini transcript inherits from the real skin. */
const ACCENT_EDGE = "border:1px solid #555;border-left:3px solid #dc2828;border-radius:8px;background:#1b1b1b;width:200px;height:60px";

auditRuleTest(
  [
    {
      rule: "side-tab",
      kind: "silent",
      reason:
        "inside an illustrated picker's art pane the accent stripe IS the subject of the picture — the cell exists to show the reader what that skin looks like, so judging it reports the diagram instead of the design",
    },
    {
      rule: "side-tab",
      kind: "fires",
      reason: "the identical stripe on a real surface outside any art pane is the rule's actual target and must stay judged",
    },
    {
      rule: "border-accent-on-rounded",
      kind: "silent",
      reason: "the same picture, the same subject — an art pane is one exemption for the whole accent-border family, not a per-rule patch",
    },
    {
      rule: "border-accent-on-rounded",
      kind: "fires",
      reason: "the radius+edge contradiction outside an art pane is unchanged",
    },
  ],
  "an accent stripe inside a picker cell's ART PANE is exempt; the identical stripe outside one stays judged",
  async ({ runCli, scratch }) => {
    // `[data-slot=picker-cell-art]` is `@orb/ui`'s PickerCell aperture (packages/ui/src/primitives/
    // picker-cell/picker-cell.tsx), so the exemption is keyed on the SHARED vocabulary: the chat-style,
    // density and elevation illustrated pickers all ride this one row rather than one selector each.
    const body = `<div data-slot="picker-cell">
  <span data-slot="picker-cell-art"><div id="art-stripe" style="${ACCENT_EDGE}">skin diagram</div></span>
  <span data-slot="picker-cell-body">Bubble</span>
</div>
<div id="real-stripe" style="${ACCENT_EDGE}">a real surface</div>`;
    await writeFile(join(scratch, "picker-art-exemption.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "picker-art-exemption.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

    for (const rule of ["side-tab", "border-accent-on-rounded"]) {
      const selectors = findingSelectors(res.stdout, rule);
      expect(selectors, `${rule}: the rule's real target must stay judged`).toContain("#real-stripe");
      expect(selectors, `${rule}: the picture of the tell is not the tell`).not.toContain("#art-stripe");
    }
  },
);

// ── #1075 (orb-ui audit F3): the house media-zoom idiom — group-hover on the WRAPPER, not the <img> ──
//
// media-tile-grid's cover span carries `group-hover:scale-105` (packages/ui/src/primitives/
// media-tile-grid/variants.ts:43); the <img> inside it carries no transform class of its own. The
// class arm read only the img's OWN class list with a bare `hover:` prefix, so this idiom — the one
// this codebase actually authors — was invisible in all three ways the audit named: the wrapper class
// was never read, `group-hover:` was never an accepted prefix, and the stylesheet arm's `/img/i`
// selector-text test never matches a selector naming only the wrapper's class.

auditRuleTest(
  [
    {
      rule: "animated-img-hover",
      kind: "fires",
      reason:
        "the house media-zoom idiom — `group-hover:scale-105` on the cover WRAPPER around the <img>, media-tile-grid's real shape — was invisible before #1075: the class arm read only the img's own classes with a bare `hover:` prefix",
    },
  ],
  "an img zoomed by a group-hover class on its wrapper is now caught",
  async ({ runCli, scratch }) => {
    const body = `<div class="group" style="width:200px;height:120px">
  <span class="relative overflow-hidden group-hover:scale-105" id="cover-wrap" style="display:block;width:100%;height:100%">
    <img id="cover-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" alt="" />
  </span>
</div>`;
    await writeFile(join(scratch, "media-zoom-wrapper.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "media-zoom-wrapper.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    expect(findingSelectors(res.stdout, "animated-img-hover").length, "the wrapper-hover zoom must be caught").toBeGreaterThan(0);
  },
);

auditRuleTest(
  [
    {
      rule: "animated-img-hover",
      kind: "silent",
      reason:
        "a static image with no hover/group-hover transform anywhere in its wrapper chain is the negative control — the widened wrapper walk must not blanket-flag every image",
    },
  ],
  "a static image with no hover transform in its wrapper chain is not flagged",
  async ({ runCli, scratch }) => {
    const body = `<div class="group" style="width:200px;height:120px">
  <span class="relative overflow-hidden" id="cover-wrap-static" style="display:block;width:100%;height:100%">
    <img id="cover-img-static" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" alt="" />
  </span>
</div>`;
    await writeFile(join(scratch, "media-zoom-static.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "media-zoom-static.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    expect(findingSelectors(res.stdout, "animated-img-hover")).toHaveLength(0);
  },
);
