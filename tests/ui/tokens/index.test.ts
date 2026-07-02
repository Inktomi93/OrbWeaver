// The derived-theme FRESHNESS gate (UI-Architecture §3, D42: "the Tailwind theme is DERIVED, never
// hand-authored — drift is impossible by construction"). This test IS the construction: it re-runs
// the codegen from src/tokens/tokens.json and byte-compares against the committed artifacts, so a
// hand-edited theme.css/index.ts OR a tokens.json edit without `pnpm --filter @orb/ui tokens:build`
// fails `pnpm test`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateArtifacts } from "../../../packages/ui/tokens.build.ts";
import { expect, test } from "../../support/fixtures";

const UI_ROOT = join(import.meta.dirname, "../../../packages/ui");

test("theme.css and tokens/index.ts are exactly what tokens.json derives (no drift, no hand edits)", async () => {
  const { themeCss, tokensTs } = await generateArtifacts();
  expect(readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8")).toBe(themeCss);
  expect(readFileSync(join(UI_ROOT, "src/tokens/index.ts"), "utf8")).toBe(tokensTs);
});

test("the touch floor holds: no control-height token below spacing.touch-target (gate touch-target-floor)", async () => {
  const { tokensTs } = await generateArtifacts();
  const rem = (name: string): number => {
    const match = tokensTs.match(new RegExp(`"spacing\\.${name}".*value: "([\\d.]+)rem"`, "u"));
    expect(match, `spacing.${name} must exist as a rem dimension`).not.toBeNull();
    return Number(match?.[1]);
  };
  const floor = rem("touch-target");
  expect(floor).toBeGreaterThanOrEqual(2.75); // 44px @ 16px root
  for (const control of ["control-sm", "control-md", "control-lg"]) {
    expect(
      rem(control),
      `spacing.${control} may not undercut the ≥44px touch floor`,
    ).toBeGreaterThanOrEqual(floor);
  }
});

test("the load-bearing token names exist (scrim · chart ramp · the D44 §12.1 override targets)", async () => {
  const { themeCss } = await generateArtifacts();
  const required = [
    "--color-scrim",
    "--color-chart-1",
    "--color-chart-5",
    "--color-user-bubble",
    "--color-ai-bubble",
    "--color-dialogue",
    "--color-narration",
    "--color-prose-body",
    "--color-speaker",
    "--container-cq-sm",
    "--spacing-touch-target",
  ];
  for (const name of required) {
    expect(themeCss, `${name} must be emitted into @theme`).toContain(`${name}:`);
  }
});
