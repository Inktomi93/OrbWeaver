// Both-direction controls for the density-tier resolution census (tooling/src/ui-audit/ops/walker/census-tier.ts
// + lib/checks-quality.ts checkTierDrift). The fixtures reproduce the tiers.css MECHANISM in miniature — a
// `--orb-tier-*` custom property set by `[data-surface-tier]`, consumed unlayered by a `[data-slot]` rule —
// rather than loading the real stylesheet, matching the sibling occlusion-family precedent (census-occlusion.int.test.ts).
//
// ZERO FINDINGS ON THE LIVE TREE IS THE SUCCESS CONDITION for this rule, which makes a false positive the
// expensive failure: every trap the brief named (an opt-in that outranks the tier, a slot outside every
// Surface, a broken var chain) gets its own SILENT proof here, not just the firing case.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads: every live rule id owes an executable
 *  FIRING proof and an executable SILENCE proof for each way it must decline, attached to the test that
 *  exercises it — so deleting the test deletes the proof rather than leaving a claim behind. */
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

interface AuditRun {
  readonly report: RelationalPopulationReport;
  /** `null` when the process was signalled rather than exiting — never conflated with a clean 0. */
  readonly code: number | null;
}

interface AuditFixture {
  readonly scratch: string;
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly name: string;
  readonly body: string;
}

async function auditFixture({ scratch, runCli, name, body }: AuditFixture): Promise<AuditRun> {
  const reportPath = join(scratch, `${name}.json`);
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const result = await runCli("ui-audit", ["/" + name + ".html", "--base", `file://${scratch}`, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  return { report: JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport, code: result.code };
}

/** The tiers.css mechanism, reproduced in miniature: an "instrument" tier declaring one pair of
 *  `--orb-tier-*` values, a card-root rule consuming them unlayered, and the ELEVATED opt-in that must
 *  outrank the tier by higher specificity — exactly as tiers.css itself does it. */
const CARD_TIER_CSS = `<style>
  [data-surface-tier="instrument"] { --orb-tier-island-pad: 8px; --orb-tier-island-radius: 4px; }
  [data-surface-tier] [data-slot="card-root"] { padding: var(--orb-tier-island-pad); border-radius: var(--orb-tier-island-radius); }
  [data-surface-tier] [data-slot="card-root"][data-elevated] { border-radius: 20px; }
</style>`;

// ── fires: the tier declares one pixel, the paint delivers another ───────────

auditRuleTest(
  [
    {
      rule: "tier-drift",
      kind: "fires",
      reason: "an inline style overrides card-root padding to 20px while the surface's declared instrument tier sanctions 8px",
    },
  ],
  "a painted padding that diverges from the surface's declared tier is a tier-drift",
  async ({ runCli, scratch }) => {
    const body = `${CARD_TIER_CSS}<div data-surface-tier="instrument"><div data-slot="card-root" style="padding:20px;width:100px;height:60px;background:#222">Card</div></div>`;
    const { report } = await auditFixture({ scratch, runCli, name: "tier-drift-defect", body });
    const findings = report.findings.filter(({ rule }) => rule === "tier-drift");
    expect(findings).toHaveLength(1);
    // Both padding AND border-radius are candidates on card-root; only padding was pushed off-tier.
    expect(report.populationAccounting?.["tier-drift"]).toMatchObject({ candidates: 2, judged: 2, emitted: 1 });
  },
);

// ── silent: the opt-in that outranks the tier ─────────────────────────────────

auditRuleTest(
  [
    {
      rule: "tier-drift",
      kind: "silent",
      reason:
        "the nearest legitimate neighbour: an ELEVATED card-root, whose border-radius the tier map's own opt-in outranks by design and must not be compared against the tier's default",
    },
  ],
  "an ELEVATED card-root's opted-out radius is excluded, not flagged against the tier default",
  async ({ runCli, scratch }) => {
    const body = `${CARD_TIER_CSS}<div data-surface-tier="instrument"><div data-slot="card-root" data-elevated style="width:100px;height:60px;background:#222">Card</div></div>`;
    const { report } = await auditFixture({ scratch, runCli, name: "tier-drift-elevated", body });
    expect(report.findings.filter(({ rule }) => rule === "tier-drift")).toHaveLength(0);
    // padding is judged and passes (8px sanctioned == 8px painted); radius is excluded as an opt-in.
    expect(report.populationAccounting?.["tier-drift"]).toMatchObject({
      candidates: 2,
      judged: 1,
      affected: 0,
      excluded: { "opt-in": 1 },
    });
  },
);

// ── silent: outside every Surface, the utility default is correct by design ──

auditRuleTest(
  [
    {
      rule: "tier-drift",
      kind: "silent",
      reason:
        "a card-root with no [data-surface-tier] ancestor at all — deliberately mismatched values that would have fired if judged, to prove the exclusion happens BEFORE any comparison",
    },
  ],
  "a card-root outside every Surface keeps its own default, never judged against a tier",
  async ({ runCli, scratch }) => {
    const body = `${CARD_TIER_CSS}<div data-slot="card-root" style="padding:99px;border-radius:99px;width:100px;height:60px;background:#222">Card</div>`;
    const { report } = await auditFixture({ scratch, runCli, name: "tier-drift-untiered", body });
    expect(report.findings.filter(({ rule }) => rule === "tier-drift")).toHaveLength(0);
    expect(report.populationAccounting?.["tier-drift"]).toMatchObject({
      candidates: 2,
      judged: 0,
      excluded: { "no-surface-tier": 2 },
    });
  },
);

// ── withheld: a broken var chain is a NO VERDICT, never a clean pass ─────────

auditRuleTest(
  [
    {
      rule: "tier-drift",
      kind: "silent",
      reason:
        "a [data-surface-tier] host that never declares --orb-tier-island-pad/--orb-tier-island-radius at all — the custom-property chain is broken, so the instrument cannot know what the tier sanctions and must withhold rather than compare against nothing",
    },
  ],
  "a surface tier that never resolves its own custom properties is withheld, never judged clean",
  async ({ runCli, scratch }) => {
    // "broken" is a real [data-surface-tier] value, but this fixture's <style> never defines
    // --orb-tier-island-pad/--orb-tier-island-radius for it, so getPropertyValue reads back "".
    const body = `${CARD_TIER_CSS}<div data-surface-tier="broken"><div data-slot="card-root" style="width:100px;height:60px;background:#222">Card</div></div>`;
    const { report, code } = await auditFixture({ scratch, runCli, name: "tier-drift-broken", body });
    expect(report.findings.filter(({ rule }) => rule === "tier-drift")).toHaveLength(0);
    expect(report.populationAccounting?.["tier-drift"]).toMatchObject({
      candidates: 2,
      judged: 0,
      withheld: { unresolved: 2 },
    });
    // A withheld candidate is a NO VERDICT run, not a pass — the runner must refuse rather than report clean.
    expect(code).toBe(2);
  },
);

// ── silent: a matched tier with a matched pixel stays quiet ──────────────────

auditRuleTest(
  [
    {
      rule: "tier-drift",
      kind: "silent",
      reason: "a card-root inside the declared instrument tier whose padding and radius both resolve to exactly what the tier map sanctions",
    },
  ],
  "a card-root that resolves to exactly its tier's sanctioned pixel is judged clean",
  async ({ runCli, scratch }) => {
    const body = `${CARD_TIER_CSS}<div data-surface-tier="instrument"><div data-slot="card-root" style="width:100px;height:60px;background:#222">Card</div></div>`;
    const { report, code } = await auditFixture({ scratch, runCli, name: "tier-drift-clean", body });
    expect(report.findings.filter(({ rule }) => rule === "tier-drift")).toHaveLength(0);
    expect(report.populationAccounting?.["tier-drift"]).toMatchObject({ candidates: 2, judged: 2, affected: 0 });
    expect(code).toBe(0);
  },
);
