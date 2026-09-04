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
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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

/** Every findings-table selector for one rule. The table is `severity rule selector message (value)`
 *  with fixed-width columns. Read from the TABLE rather than by substring: the same selectors also appear
 *  in the withheld/obscured denominators above it, where their presence says nothing about the verdict. */
function findingSelectors(stdout: string, rule: string): readonly string[] {
  const rows: string[] = [];
  for (const line of stdout.split("\n")) {
    const fields = line.trim().split(/\s+/u);
    if (fields[1] === rule && (fields[0] ?? "").startsWith("P") && fields[2] !== undefined) {
      rows.push(fields[2]);
    }
  }
  return rows;
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
    const res = await runCli("ui-audit", ["/overlay-exemption.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

    // One and only one: the class-word coincidence is judged (it was silently exempt before), and the
    // real popup role stays exempt — the rewrite must not trade one error for the other.
    expect(findingSelectors(res.stdout, "nested-card")).toEqual(["#inner-classword"]);
  },
);
