import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as playwrightCssTopology } from "../../../../tooling/src/verify/gates/playwright-css-topology.ts";
import { gate as sanctionedCssHomes } from "../../../../tooling/src/verify/gates/sanctioned-css-homes.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [sanctionedCssHomes, playwrightCssTopology] as const;

test("the css-home-topology pair keeps its three-arm proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

/** THE §6.3 RECEIPT AND REFUSAL PINS a proof row cannot express (guide §6.3, `docs/law/resource-policy-contract.md`
 *  §3.6). Both members are `hard` resource policies with no waiver door, so there is no §4.2 identity arm to
 *  carry here; what rows CANNOT carry is the RECEIPT PAIR of a complete run — one `kind: "resource"` receipt
 *  per declaration with `unresolved: 0` — and an EMPTY declared tree, which no `files` map can express
 *  because an overlay has no way to spell an existing directory with no members. Both members' MISSING-
 *  declaration refusals ride `mustRefuse` rows in the modules themselves and therefore run on the static
 *  bar; only these two are owed a suite. */
const HOMES = {
  "packages/ui/src/tokens/tokens.json": "{}\n",
  "packages/ui/src/styles/theme.css": "@layer theme {}\n",
  "packages/ui/src/styles/globals.css": "@layer base {}\n",
  "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
  "packages/client/src/styles/globals.css": "@layer base {}\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
} as const;

/** The overlay is the RESOURCE transaction; a hybrid policy also needs its COMPILER population, and an
 *  empty candidate corpus is a population-phase tool error rather than a clean run — which is exactly what
 *  the first draft of the topology pin measured. `runResourceExample` does this for a proof row through
 *  `isPolicySourceCandidate`; a hand-driven pass owes the same. */
function pass(policy: (typeof policies)[number], scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(join(scratch, path), content, { overwrite: true });
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: scratch,
    project,
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("a complete packages tree lets sanctioned-css-homes reach a verdict and file one receipt per declaration", ({ scratch }) => {
  const result = pass(sanctionedCssHomes, scratch, HOMES);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // 16 members = the six home files plus the ten directories the walk emits above them (`packages/{ui,client}`,
  // each `src`, `ui/src/{tokens,styles}`, `client/src/{styles,features}`, and the two app-shell levels).
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([[{ kind: "resource", source: "authored-tree:packages", resources: 16, unresolved: 0 }]]);
});

/** The sibling's receipt shape, which is the one thing its `mustRefuse` rows cannot say: SEVEN declarations
 *  (six exact ids plus the product identity) file TWO receipts, because `bindPolicyResources`' exact-file
 *  door receipts the whole demanded LIST once — its `source` is the SORTED id list, which is what makes a
 *  dropped id visible here — while crediting all six as consumed. A declaration that stopped being consumed
 *  would surface as a receipt-phase refusal rather than as a quiet pass. */
const TOPOLOGY = {
  "packages/client/src/main.tsx": 'import "./styles/index.ts";\n',
  "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const AppShell = 1;\n",
  "packages/client/src/styles/index.ts": 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
  "playwright/index.tsx": 'import "@orb/client/styles";\n',
  "playwright-ct.config.ts":
    'const marker = "packages/client/src/styles/globals.css";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n',
  "playwright/index.css": '@source "../../../../tests";\n',
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
  "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
  "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
  "packages/ui/src/styles/theme.css": ":root {}\n",
  "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
} as const;

test("a complete topology lets playwright-css-topology reach a verdict and receipt both of its declaration kinds", ({ scratch }) => {
  const result = pass(playwrightCssTopology, scratch, TOPOLOGY);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.flatMap(({ receipts }) => receipts.filter((receipt) => receipt.kind === "resource"))).toEqual([
    { kind: "resource", source: "css-inventory:product", resources: 5, unresolved: 0 },
    {
      kind: "resource",
      source: "exact-file:app-shell-surface,client-css-entry,client-entry,ct-boot,ct-extension-css,playwright-ct-config",
      resources: 6,
      unresolved: 0,
    },
  ]);
});

/** THE `unresolved` STATUS OF BOTH DECLARATION FAMILIES, and it is the status the #2294 repair left out
 *  (#2314). A status set is a property of the READER, and neither of these can be a proof row:
 *
 *  - `ops/resource-reader.ts#tree` answers `unresolved` for ANY throw inside the walk, and the authored
 *    walk throws on a SYMBOLIC LINK. A `files` map cannot spell a symlink, so `authored-tree:packages`'s
 *    third status has no row and lives here. (`missing` is a row; `empty` is the pin below, which an
 *    overlay also cannot spell.)
 *  - `#read` answers `unresolved` for an invalid UTF-8 byte, which a JS STRING map cannot carry
 *    (`Buffer.from("\uD800")` decodes cleanly), so `product-css`'s and `exact-file`'s fourth/third
 *    statuses have no row either.
 *
 *  All three are driven on a real `mkdtemp` root with NO overlay — an overlay string short-circuits the
 *  disk read (`resource-reader.ts` prefers `overlay.get(path)` over `diskBytes`), which is precisely how
 *  these pins would pass for the wrong reason — and each sits beside a HEALTHY TWIN on the same substrate.
 */
function passOnDisk(
  policy: (typeof policies)[number],
  scratch: string,
  files: Readonly<Record<string, string>>,
  bytes: Readonly<Record<string, readonly number[]>> = {},
): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), content);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(join(scratch, path), content, { overwrite: true });
    }
  }
  for (const [path, raw] of Object.entries(bytes)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), Buffer.from(raw));
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
}

test("a SYMLINK under packages/ refuses authored-tree as `unresolved` — the third status, and no row can spell it", ({ scratch }) => {
  const result = ((): PolicyPassResult => {
    for (const [path, content] of Object.entries(HOMES)) {
      mkdirSync(join(scratch, path, ".."), { recursive: true });
      writeFileSync(join(scratch, path), content);
    }
    symlinkSync(join(scratch, "packages/ui/src/styles/globals.css"), join(scratch, "packages/ui/src/styles/alias.css"));
    return runPolicyPass({
      knownPolicies: [sanctionedCssHomes],
      policies: [sanctionedCssHomes],
      root: scratch,
      project: new Project({ skipAddingFilesFromTsConfig: true }),
      reviewedGrants: [],
      failOnWarnings: false,
    });
  })();

  expect(result.authority.withheldPolicyIds).toEqual(["sanctioned-css-homes"]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.toolErrors.map(({ phase, message }) => [phase, message])).toEqual([
    ["population", expect.stringContaining("resource declaration authored-tree:packages is unresolved: authored resource traverses a symbolic link")],
  ]);
});

test("the HEALTHY TWIN of the symlink pin reaches a verdict on the same substrate", ({ scratch }) => {
  const result = passOnDisk(sanctionedCssHomes, scratch, HOMES);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

test("an UNREADABLE product stylesheet refuses as `unresolved`", ({ scratch }) => {
  const { "packages/ui/src/styles/theme.css": _sheet, ...withoutTheme } = TOPOLOGY;
  const result = passOnDisk(playwrightCssTopology, scratch, withoutTheme, { "packages/ui/src/styles/theme.css": [0x40, 0xff, 0x0a] });

  expect(result.authority.withheldPolicyIds).toEqual(["playwright-css-topology"]);
  expect(result.toolErrors.map(({ phase, message }) => [phase, message])).toEqual([
    ["population", expect.stringContaining("resource declaration product-css is unresolved: The encoded data was not valid for encoding utf-8")],
  ]);
});

test("an UNREADABLE exact anchor refuses the whole exact-file fact as `unresolved`", ({ scratch }) => {
  // The exact-file declaration's THIRD status. `ops/resource-exact.ts` forwards `read`'s status for any
  // demanded id, so an anchor whose bytes are not UTF-8 is `unresolved` — not `missing` (the file is
  // there) and not `empty` (it has bytes). A text arm handed those bytes would otherwise judge mojibake.
  const { "playwright/index.tsx": _boot, ...withoutBoot } = TOPOLOGY;
  const result = passOnDisk(playwrightCssTopology, scratch, withoutBoot, { "playwright/index.tsx": [0x69, 0xff, 0x0a] });

  expect(result.authority.withheldPolicyIds).toEqual(["playwright-css-topology"]);
  expect(result.toolErrors.map(({ phase, message }) => [phase, message])).toEqual([
    ["population", expect.stringContaining("is unresolved: exact resource ct-boot (playwright/index.tsx) is unavailable")],
  ]);
});

test("the HEALTHY TWIN of the topology unresolved pin reaches a verdict on the same substrate", ({ scratch }) => {
  const result = passOnDisk(playwrightCssTopology, scratch, TOPOLOGY);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

test("an EMPTY packages tree refuses at the population phase instead of reporting six vanished homes", ({ scratch }) => {
  // The overlay cannot express an empty directory; the scratch fixture is a real mkdtemp root, so the
  // directory exists on disk with no members. This is the other side of the boundary `mustFlag[4]` sits on:
  // one unrelated file is a tree that is missing all six homes, zero files is no tree at all.
  mkdirSync(join(scratch, "packages"), { recursive: true });
  const result = pass(sanctionedCssHomes, scratch, {});

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual(["sanctioned-css-homes"]);
  expect(result.toolErrors.map(({ phase, message }) => [phase, message])).toEqual([
    ["population", expect.stringContaining("resource declaration authored-tree:packages is empty")],
  ]);
});
