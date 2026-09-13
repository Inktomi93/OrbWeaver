import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as seedThemeInkContrast } from "../../../../tooling/src/verify/gates/seed-theme-ink-contrast.ts";
import { collectCssFacts } from "../../../../tooling/src/verify/lib/css-resource-facts.ts";
import { parseCssStylesheet } from "../../../../tooling/src/verify/lib/css-rules.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { readSeedPalettes } from "../../../../tooling/src/verify/lib/seed-theme-ink.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("seed-theme-ink-contrast keeps its three-arm proofs", () => {
  expect(verifyPolicyProofs([seedThemeInkContrast])).toEqual([]);
});

/** THE NESTING ADJUDICATION (#2293 leg 2) — three cases, three verdicts, decided rather than inherited.
 *
 *  The fold onto the shared declaration facts replaced a balanced-body TEXT scan, and the shared reader
 *  assigns a declaration to its INNERMOST block. So a `--color-*` nested one level down inside `@theme` or
 *  inside a seed vanished from the palette: measured against the frozen pre-fold reader, case (a) lost
 *  `--color-y` and case (b) lost `--color-z`. Restoring the old behaviour wholesale was the WRONG repair —
 *  it also counted case (c), a declaration on a DESCENDANT element that never was the seed's palette.
 *
 *  The adjudication, held here because it is a claim about CSS semantics and no proof row can see a
 *  palette:
 *    (a)+(b) a conditional at-rule is an ARM of its palette — `<palette> @ <prelude>` — so BOTH the
 *            unconditional and the conditional value are judged, and the arm inherits the palette's
 *            polarity unless it declares its own;
 *    (c)     a nested PLAIN SELECTOR is NOT the palette, deliberately — the twin below is what makes that
 *            exclusion an assertion rather than an accident.
 *  A control with no nesting pins that the ordinary sheet is untouched. */
function palettesOf(text: string): readonly { readonly name: string; readonly scheme: string; readonly vars: readonly string[] }[] {
  const path = "packages/ui/src/styles/theme.css";
  const parsed = parseCssStylesheet(text);
  const file = { path, text, rules: parsed.rules, atRules: parsed.atRules, statements: parsed.statements };
  const facts = collectCssFacts([file]);
  return readSeedPalettes(
    file,
    facts.declarations.filter((declaration) => declaration.file === path),
  ).map((palette) => ({ name: palette.name, scheme: palette.scheme, vars: [...palette.vars.keys()].toSorted() }));
}

const BASE = "@theme {\n  --color-x: oklch(0.5 0.1 50);\n";

test("a conditional at-rule inside @theme is an ARM of the base palette, not a lost declaration", () => {
  const palettes = palettesOf(`${BASE}  @supports (color: oklch(0 0 0)) {\n    --color-y: oklch(0.6 0.1 50);\n  }\n}\n`);

  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "hearth @ @supports (color: oklch(0 0 0))", scheme: "dark", vars: ["--color-x", "--color-y"] },
  ]);
});

test("a conditional at-rule inside a SEED is an arm of that seed, and INHERITS its polarity", () => {
  const palettes = palettesOf(
    `${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  @media (prefers-contrast: more) {\n    --color-z: oklch(0.7 0.1 50);\n  }\n}\n`,
  );

  // `scheme: "light"` is the load-bearing cell: the arm takes the SEED's polarity, not the base's, so a
  // `light-dark()` value inside it collapses to the arm a reader on that seed actually sees.
  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
    { name: "dusk @ @media (prefers-contrast: more)", scheme: "light", vars: ["--color-x", "--color-z"] },
  ]);
});

test("a nested PLAIN SELECTOR inside a seed is EXCLUDED on purpose — the twin of the two arms above", () => {
  const palettes = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  & .x {\n    --color-w: oklch(0.8 0.1 50);\n  }\n}\n`);

  // NO third palette and NO `--color-w` anywhere: its subject is a descendant element, so a `text-<token>`
  // resting on the seed never resolves against it. The retired text scan counted it; that was the defect.
  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

/** THE SUBJECT ADJUDICATION (#2293 leg 3). Root membership is decided per COMPLEX SELECTOR off its
 *  SUBJECT compound — what the rule actually styles — through the shared `selectorSubject` reader.
 *
 *  Before this, `SEED_SELECTOR` ran unanchored over the whole `selectorList`, so a FLATTENED descendant
 *  (`[data-theme="dusk"] .x`) was absorbed as the dusk root while its NESTED twin (`& .x`) was excluded by
 *  the ancestry read: the same CSS, two answers, decided by authoring style. A SIBLING subject
 *  (`[data-theme="dusk"] + .y`) was absorbed the same way. Anchoring the regex would have been the wrong
 *  repair — it throws away every legitimate compound root, which is why three of them are pinned here as
 *  positive controls beside the two exclusions. */
const SEEDED = `${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n}\n`;

test("a FLATTENED descendant subject is not the palette — and agrees with its nested twin", () => {
  const flattened = palettesOf(`${SEEDED}[data-theme="dusk"] .x {\n  --color-w: oklch(0.8 0.1 50);\n}\n`);
  const nested = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  & .x {\n    --color-w: oklch(0.8 0.1 50);\n  }\n}\n`);

  // The two spellings AGREE, which is the whole point: neither carries `--color-w`.
  expect(flattened).toEqual(nested);
  expect(flattened).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

test("a SIBLING subject is not the palette either — the same defect one combinator over", () => {
  expect(palettesOf(`${SEEDED}[data-theme="dusk"] + .y {\n  --color-s: oklch(0.1 0.1 50);\n}\n`)).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

test("a COMPOUND root stays a root — the three positive controls that forbid anchoring the regex", () => {
  // Each still STYLES the seed element, so each IS the palette: a subject qualifier narrows WHICH elements
  // carry the seed, never what the palette is, and a second block resolving to the same seed merges into
  // it rather than forking an arm. `^…$` on `SEED_SELECTOR` would have killed all three.
  for (const selector of ['[data-theme="dusk"].foo', 'html[data-theme="dusk"]', '[data-theme="dusk"]:where(.a, .b)']) {
    expect(palettesOf(`${SEEDED}${selector} {\n  --color-q: oklch(0.4 0.1 50);\n}\n`), selector).toEqual([
      { name: "hearth", scheme: "dark", vars: ["--color-x"] },
      { name: "dusk", scheme: "light", vars: ["--color-q", "--color-x"] },
    ]);
  }
});

test("an ANCESTOR context whose subject is still the seed is an ARM, never a drop", () => {
  const palettes = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  .card & {\n    --color-c: oklch(0.3 0.1 50);\n  }\n}\n`);

  // `.card &` styles the SEED element inside a card — a ground the ink really rests on. Leg 2's prose
  // called this a descendant subject and dropped it; dropping a reachable arm is the blindness this gate
  // exists to refuse, so it is an arm exactly like a conditional at-rule, polarity inherited.
  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
    { name: "dusk @ .card &", scheme: "light", vars: ["--color-c", "--color-x"] },
  ]);
});

test("a selector LIST is decided per complex selector, not per list", () => {
  // One list, two subjects: the seed itself and a descendant. The seed genuinely receives the value, so
  // the palette carries it — and the decision is made arm by arm rather than by matching the list text.
  expect(palettesOf(`${SEEDED}[data-theme="dusk"], [data-theme="dusk"] .x {\n  --color-m: oklch(0.2 0.1 50);\n}\n`)).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-m", "--color-x"] },
  ]);
});

/** A SELECTOR LIST RESOLVES TO A SET OF ROOTS (#2293 leg 4). Leg 3's own pin used one root plus its
 *  descendant, so it could not see that `seedRootsOf` returned after the FIRST match: a list naming two
 *  shipped seeds updated one and silently dropped the other — a real palette judged against a value it
 *  does not have. The four shapes below are the whole rule, and (c) is what keeps the fix from becoming
 *  "file into every seed the list mentions". */
const TWO_SEEDS = `${BASE}}\n[data-theme="light"] {\n  color-scheme: light;\n}\n[data-theme="mocha"] {\n  color-scheme: dark;\n}\n`;

const LIGHT = { name: "light", scheme: "light", vars: ["--color-x"] };
const MOCHA = { name: "mocha", scheme: "dark", vars: ["--color-x"] };
const HEARTH_ONLY = { name: "hearth", scheme: "dark", vars: ["--color-x"] };

test("a list naming TWO distinct seeds files into BOTH palettes", () => {
  expect(palettesOf(`${TWO_SEEDS}[data-theme="light"], [data-theme="mocha"] {\n  --color-q: oklch(0.4 0.1 50);\n}\n`)).toEqual([
    HEARTH_ONLY,
    { name: "light", scheme: "light", vars: ["--color-q", "--color-x"] },
    { name: "mocha", scheme: "dark", vars: ["--color-q", "--color-x"] },
  ]);
});

test("a conditional arm under TWO roots forks PER ROOT, each with its own inherited polarity", () => {
  const palettes = palettesOf(
    `${TWO_SEEDS}[data-theme="light"], [data-theme="mocha"] {\n  @media (prefers-contrast: more) {\n    --color-r: oklch(0.3 0.1 50);\n  }\n}\n`,
  );

  // The polarity cells are the claim: one `@media` block, two arms, `light` and `dark` — a single shared
  // arm would collapse both seeds onto whichever scheme was read first.
  expect(palettes).toEqual([
    HEARTH_ONLY,
    LIGHT,
    MOCHA,
    { name: "light @ @media (prefers-contrast: more)", scheme: "light", vars: ["--color-r", "--color-x"] },
    { name: "mocha @ @media (prefers-contrast: more)", scheme: "dark", vars: ["--color-r", "--color-x"] },
  ]);
});

test("a list mixing a valid root with another seed's DESCENDANT gives the value to the root only", () => {
  // `[data-theme="mocha"] .x` styles a descendant, so mocha must NOT gain it — the fix is "every root the
  // list SUBJECTS name", never "every seed the list mentions".
  expect(palettesOf(`${TWO_SEEDS}[data-theme="light"], [data-theme="mocha"] .x {\n  --color-d: oklch(0.2 0.1 50);\n}\n`)).toEqual([
    HEARTH_ONLY,
    { name: "light", scheme: "light", vars: ["--color-d", "--color-x"] },
    MOCHA,
  ]);
});

test("a DUPLICATE root in one list files exactly once", () => {
  // Two complex selectors, one seed. The palette carries the value once and no census double-counts it.
  expect(palettesOf(`${TWO_SEEDS}[data-theme="light"], [data-theme="light"].x {\n  --color-u: oklch(0.1 0.1 50);\n}\n`)).toEqual([
    HEARTH_ONLY,
    { name: "light", scheme: "light", vars: ["--color-u", "--color-x"] },
    MOCHA,
  ]);
});

/** THE THREE DELTA CLASSES THE HEADER LISTED AND NO TEST CARRIED (#2315). The module header enumerates
 *  what the fold onto the shared facts changed against the frozen pre-fold TEXT reader (`680d66e7c^`);
 *  a class named in prose and pinned by nothing is the same defect one layer out, and the verifier found
 *  three of them — two WIDER reads the header claimed, plus the seed-in-seed drop it did not mention.
 *  Each expectation below is the TIP side of a measured pair; the frozen side is in the header. */
test("a final declaration with NO trailing semicolon is read — the frozen text reader dropped it", () => {
  // FROZEN `hearth{--color-x}` (its `DECLARATION` regex required the `;`) → TIP also carries `--color-last`.
  expect(palettesOf("@theme {\n  --color-x: oklch(0.5 0.1 50);\n  --color-last: oklch(0.2 0.1 50)\n}\n")).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-last", "--color-x"] },
  ]);
});

test("a SECOND @theme block merges — the frozen text reader read only the first", () => {
  // FROZEN `hearth{--color-x}` (its `THEME_BLOCK.exec` took the first match only) → TIP merges both.
  expect(palettesOf("@theme {\n  --color-x: oklch(0.5 0.1 50);\n}\n@theme {\n  --color-second: oklch(0.3 0.1 50);\n}\n")).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-second", "--color-x"] },
  ]);
});

test("a seed nested INSIDE a seed is dropped — the frozen text reader filed it into BOTH", () => {
  // FROZEN `dusk{--color-n,x} | ember{--color-n,x}` — the balanced-body scan saw the inner opener and the
  // outer body, so one declaration became two palettes' worth. At TIP the inner block's subject is not the
  // parent (no `&`), so it falls on the descendant side of the one subject test and no `ember` is minted.
  // NARROWER, deliberately: the generator emits flat blocks and nothing on the tree authors this shape.
  expect(palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  [data-theme="ember"] {\n    --color-n: oklch(0.3 0.1 50);\n  }\n}\n`)).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

test("an ordinary flat sheet is untouched by the ancestry read — the control", () => {
  const palettes = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  --color-x: oklch(0.9 0.1 50);\n}\n`);

  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

/** THE §4.3 GRANT-IDENTITY ARM, which a proof row cannot express: `runPolicyPass` inside a module's own rows
 *  pins `reviewedGrants: []`, so a reviewed-grant policy can prove nothing about consumption there.
 *
 *  This is the arm the conversion OWES, because the nine decorative-stroke rows were a gate-owned
 *  `ExemptionTable` until #2182 (`2dabae9ce`'s own subject line; this cited #2183, the sibling pair's
 *  issue, until #2294/#2314) and §12.5 bans one. What the migration must not lose is the table's two-sided
 *  ratchet: the row licenses exactly the ink it names, and a row whose ink stopped being painted goes STALE
 *  rather than sitting forever. Both directions are asserted below, plus the wrong-operation control that
 *  says the identity is the (carrier, ink) PAIR and not the file. */
const SEEDS =
  "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-track-1: oklch(0.93 0.02 145);\n}\n:root { color-scheme: light; }\n";
const CARRIER = "packages/ui/src/charts/meter/variants.ts";
const OVERLAY = {
  "packages/ui/src/styles/theme.css": SEEDS,
  "packages/ui/src/styles/globals.css": "@layer base {}\n",
  "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
  "packages/client/src/styles/globals.css": "@layer base {}\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
  [CARRIER]: "import { tv } from 'tailwind-variants';\nexport const meter = tv({ base: 'text-track-1' });",
} as const;

function grant(subject: string, operation: string): ReviewedGateGrant {
  return {
    // The id is DERIVED from the identity, never a shared literal: two rows sharing an id reconcile as one
    // and the stale arm below reads clean (measured — that is how this test first passed for the wrong
    // reason).
    id: `seed-theme-ink-contrast:probe:${subject}:${operation}`,
    policyId: "seed-theme-ink-contrast",
    subject,
    operation,
    why: "probe row",
    endsWhen: "the probe ends",
  };
}

function pass(scratch: string, grants: readonly ReviewedGateGrant[]): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(`${scratch}/${CARRIER}`, OVERLAY[CARRIER], { overwrite: true });
  return runPolicyPass({
    knownPolicies: [seedThemeInkContrast],
    policies: [seedThemeInkContrast],
    root: scratch,
    project,
    resourceOptions: { overlay: OVERLAY },
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("the exact (carrier, ink) grant consumes the decorative candidate once and leaves no alarm", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-1")]);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("a grant naming the FILE but the wrong ink licenses nothing, and stales — the identity is the pair", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-9")]);

  expect(result.authority.effectiveFindings.map(({ operation }) => operation)).toEqual(["ink:track-1"]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("a grant whose ink stopped being painted is STALE — the two-sided ratchet the retired table owned by hand", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-1"), grant("packages/ui/src/primitives/switch/variants.ts", "ink:background")]);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

/** `product-css`'s FOURTH reachable status, and the one no proof row can express (#2314).
 *
 *  The status set is a property of the READER: `ops/resource-tree.ts#loadCssFiles` forwards
 *  `ops/resource-reader.ts#read`'s status BEFORE it can judge the CSS grammar, and `read` answers
 *  `missing` · `empty` · `unresolved` (any throw that is not ENOENT — an invalid UTF-8 byte, a directory,
 *  a refused symlink); `loadCssFiles` then adds `malformed` of its own. `missing`, `malformed` and `empty`
 *  are `mustRefuse` ROWS in the module. `unresolved` cannot be: a row's `files` map is a JS STRING map and
 *  no string carries an invalid UTF-8 byte (`Buffer.from("\uD800")` is the replacement character, which
 *  decodes cleanly). So it is pinned here, on a real `mkdtemp` root, written as BYTES, with NO overlay —
 *  an overlay string short-circuits the disk read (`resource-reader.ts` prefers `overlay.get(path)` over
 *  `diskBytes`), which is exactly how this pin would otherwise pass for the wrong reason.
 *
 *  The HEALTHY TWIN uses the same helper on the same substrate, so a refusal produced by the harness
 *  rather than by the planted byte cannot pass. The twin also supplies the COMPILER half: this policy is a
 *  declared hybrid, and a root with no admitted `@client`/`@ui` source refuses with "candidate corpus is
 *  empty" — a refusal about the harness wearing the resource refusal's clothes. */
const DISK_CSS: Readonly<Record<string, string>> = {
  "packages/ui/src/styles/theme.css": SEEDS,
  "packages/ui/src/styles/globals.css": "@layer base {}\n",
  "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
  "packages/client/src/styles/globals.css": "@layer base {}\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
};

function passOnDisk(scratch: string, files: Readonly<Record<string, string>>, bytes: Readonly<Record<string, readonly number[]>>): PolicyPassResult {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), content);
  }
  for (const [path, raw] of Object.entries(bytes)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), Buffer.from(raw));
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(join(scratch, CARRIER), OVERLAY[CARRIER], { overwrite: true });
  return runPolicyPass({
    knownPolicies: [seedThemeInkContrast],
    policies: [seedThemeInkContrast],
    root: scratch,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("an UNREADABLE product stylesheet refuses as `unresolved` — the status no proof row can express", ({ scratch }) => {
  const { "packages/ui/src/styles/theme.css": _sabotaged, ...intact } = DISK_CSS;
  const result = passOnDisk(scratch, intact, { "packages/ui/src/styles/theme.css": [0x40, 0xff, 0x0a] });

  expect(result.authority.withheldPolicyIds).toEqual(["seed-theme-ink-contrast"]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ owner }) => owner.status)).toEqual(["incomplete"]);
  expect(result.toolErrors.map(({ phase, message }) => [phase, message])).toEqual([
    ["population", expect.stringContaining("resource declaration product-css is unresolved: The encoded data was not valid for encoding utf-8")],
  ]);
});

test("the HEALTHY TWIN of that pin reaches a verdict on the same substrate", ({ scratch }) => {
  const result = passOnDisk(scratch, DISK_CSS, {});

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

/** The nine migrated rows, held two-sided against the module they license. A row added for a policy that
 *  cannot report its identity shape would pass every other check in the tree. */
test("every seed-theme-ink grant names an ink operation on a ui carrier", () => {
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === "seed-theme-ink-contrast");

  expect(rows).toHaveLength(9);
  expect(rows.every(({ operation }) => operation.startsWith("ink:"))).toBe(true);
  expect(rows.every(({ subject }) => subject.startsWith("packages/ui/src/"))).toBe(true);
});
