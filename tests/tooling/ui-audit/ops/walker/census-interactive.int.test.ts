// The NATIVE LABEL association, proven through the whole instrument (#1009). The accessible-name census
// (ops/walker/census-interactive.ts) read aria-label / aria-labelledby / visible text / title / alt and
// nothing else, so a control named the way HTML has always named controls — `<label for=…>` — was filed
// `aria-name` P1 "exposes no accessible name", and carried an EMPTY door name besides.
//
// SCOPE (re-derived, and it corrects the premise this work was dispatched with): the dispatched "real
// site", packages/client/src/components/setting-switch-row.tsx, is NOT one — Base UI belts every
// association, so its Switch carries `aria-labelledby` as well as the `<label for>` and the census
// already named it. No live app surface today is named by the native association ALONE. This closed a
// LATENT false-positive class: a bare `<label for>` is correct, lint-clean HTML, and an instrument that
// files a P1 on correct markup teaches authors to add redundant aria to appease it.
//
// PRECISION IS THE WHOLE DIFFICULTY. A rule that says "this control has no name" is expensive in BOTH
// directions: a false positive trains readers to discount P1s, and a false negative is a genuinely
// unnamed control reported clean. So the association is resolved by the BROWSER's own
// `HTMLElement.labels` (which knows `for=` and wrapping alike, and knows a `for` pointing elsewhere is
// not an association) rather than by a selector this file would have to keep correct.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads — the sibling census suites' shape. */
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

async function auditFixture(scratch: string, runCli: ToolContext["runCli"], name: string, body: string): Promise<RelationalPopulationReport> {
  const reportPath = join(scratch, `${name}.json`);
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  await runCli("ui-audit", ["/" + name + ".html", "--base", `file://${scratch}`, "--out", reportPath], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
}

/** The control paints a box and carries no text of its own — the switch/checkbox shape exactly. */
const CONTROL = 'style="width:40px;height:24px;background:#444;border:0"';

function namesIn(report: RelationalPopulationReport): readonly { readonly rule: string }[] {
  return report.findings.filter(({ rule }) => rule === "aria-name");
}

// ── silent: the association HTML has always used ─────────────────────────────

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason:
        "a `<label for>` names its control — the app's own settings rows (Field + Switch) are built exactly this way, so filing them unnamed made every one of them a standing false P1",
    },
  ],
  "a control named by <label for> is not filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<label for="sw-1">Show timestamps</label><button role="switch" id="sw-1" ${CONTROL}></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-for", body))).toHaveLength(0);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason: "the wrapping-label spelling of the same association, which the browser reports through the same HTMLElement.labels list",
    },
  ],
  "a control wrapped in its <label> is not filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<label>Show timestamps <button role="switch" id="sw-2" ${CONTROL}></button></label>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-wrap", body))).toHaveLength(0);
  },
);

// ── fires: the rule must still catch what it exists to catch ─────────────────

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason:
        "the planted control: a switch with no label, no aria-label and no text is genuinely unnamed and must still be a P1 — a name resolver that silences this has traded a false positive for a false clean",
    },
  ],
  "a control with no label of any kind is still filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<button role="switch" id="sw-3" ${CONTROL}></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-none", body))).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason:
        "the precision neighbour: a `<label for>` naming a DIFFERENT id is not this control's name, and a resolver that reached for the nearest label element instead of the real association would silence it",
    },
  ],
  "a <label for> pointing at another id does not name this control",
  async ({ runCli, scratch }) => {
    const body = `<label for="sw-elsewhere">Show timestamps</label><button role="switch" id="sw-4" ${CONTROL}></button><button id="sw-elsewhere" ${CONTROL}>elsewhere</button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-other", body))).toHaveLength(1);
  },
);

// ── the OTHER half of the same blindness: the door census ────────────────────
// `doorName` is computed from the same chain in the same census, so a `for`-labelled control was not
// merely mis-filed as unnamed — it was a NAMELESS door, and `duplicate-action-door` (which skips
// zero-length names outright) could not see it at all. This pins the door half through the only surface
// that publishes it. It is also the blast-radius receipt for the change: the doors this makes visible
// can only ever produce a P3 advisory, never a run-failing severity.

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "fires",
      reason:
        "two structurally distinct switches named ONLY by their <label for> are the same offered action from two homes — before #1009 both carried an empty door name and the rule skipped them silently",
    },
  ],
  "a control named only by <label for> is censused as a named action door",
  async ({ runCli, scratch }) => {
    const row = (id: string): string => `<label for="${id}">Show timestamps</label><button role="switch" id="${id}" ${CONTROL}></button>`;
    const body = `<section><div>${row("dup-a")}</div></section><article><p>x</p>${row("dup-b")}</article>`;
    const report = await auditFixture(scratch, runCli, "door-label-for", body);
    const doors = report.findings.filter(({ rule }) => rule === "duplicate-action-door");
    expect(doors).toHaveLength(1);
  },
);
