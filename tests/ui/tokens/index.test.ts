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

/** The emitted pointer-fine override block — its `:root { … }` body is capture group 1. */
const FINE_BLOCK_RE = /@media \(pointer: fine\) \{\s*:root \{([\s\S]*?)\}\s*\}/u;

test("theme.css and tokens/index.ts are exactly what tokens.json derives (no drift, no hand edits)", async () => {
  const { themeCss, tokensTs } = await generateArtifacts();
  expect(readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8")).toBe(themeCss);
  expect(readFileSync(join(UI_ROOT, "src/tokens/index.ts"), "utf8")).toBe(tokensTs);
});

test("the touch floor holds PER-POINTER: coarse @theme meets ≥44px, fine override is 28/34/40 (D62 P1, gate touch-target-floor)", async () => {
  const { themeCss, tokensTs } = await generateArtifacts();

  // COARSE — the @theme values (the TS map's static `value` = the coarse literal): the ≥44px floor.
  const coarseRem = (name: string): number => {
    const match = tokensTs.match(new RegExp(`"spacing\\.${name}".*value: "([\\d.]+)rem"`, "u"));
    expect(match, `spacing.${name} must exist as a rem dimension`).not.toBeNull();
    return Number(match?.[1]);
  };
  const coarseFloor = coarseRem("touch-target");
  expect(coarseFloor).toBeGreaterThanOrEqual(2.75); // 44px @ 16px root
  for (const control of ["control-sm", "control-md", "control-lg"]) {
    expect(
      coarseRem(control),
      `coarse spacing.${control} may not undercut the ≥44px touch floor`,
    ).toBeGreaterThanOrEqual(coarseFloor);
  }

  // FINE — the emitted @media(pointer:fine) :root override: the desktop density scale.
  const fineBlock = themeCss.match(FINE_BLOCK_RE);
  expect(
    fineBlock,
    "an @media(pointer:fine) :root override block must be emitted for the desktop density scale",
  ).not.toBeNull();
  const fineBody = fineBlock?.[1] ?? "";
  const fineRem = (name: string): number => {
    const m = fineBody.match(new RegExp(`--spacing-${name}:\\s*([\\d.]+)rem`, "u"));
    expect(m, `--spacing-${name} must be present in the fine override block`).not.toBeNull();
    return Number(m?.[1]);
  };
  expect(fineRem("touch-target"), "fine touch-target = 28px").toBe(1.75);
  expect(fineRem("control-sm"), "fine control-sm = 28px").toBe(1.75);
  expect(fineRem("control-md"), "fine control-md = 34px").toBe(2.125);
  expect(fineRem("control-lg"), "fine control-lg = 40px").toBe(2.5);
  const fineFloor = fineRem("touch-target");
  for (const control of ["control-sm", "control-md", "control-lg"]) {
    expect(
      fineRem(control),
      `fine spacing.${control} may not undercut the fine touch floor`,
    ).toBeGreaterThanOrEqual(fineFloor);
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
    "--color-info",
    "--shadow-glow",
    "--shadow-overlay",
    "--text-micro",
    "--tracking-micro",
    "--spacing-avatar-sm",
    "--spacing-avatar-md",
    "--spacing-avatar-lg",
  ];
  for (const name of required) {
    expect(themeCss, `${name} must be emitted into @theme`).toContain(`${name}:`);
  }
});
