// Gate: playwright-lane-outside-fast-check — browser-mode test suffixes (.ct.tsx, .spec.ts) must never
// appear in vitest project include arrays. Vitest cannot run Playwright CT or e2e files; importing them
// under vitest hangs the worker in browser-mode negotiation and reads as a mysterious timeout.
// ARM A: RUNTIME_BY_FAMILY maps a browser family to "vitest" instead of its playwright runner.
// ARM B: a vitest project include glob literally contains a browser-only suffix.
// DECLARED LIMITS: only catches LITERAL suffix globs; a programmatic rewrite that injects the suffix at
// runtime is invisible to the syntax walk.
// FAMILY: singleton — subject is the vitest config project includes, not a repeated shape.
//
// TWO SUBJECTS, TWO SUBSTRATES, AND ARM B WAS BLIND (#2393, 2026-09-18). The header used to claim a
// population of "the two authored files that own the runner boundary: test-kinds.ts and vitest.config.ts".
// Only ONE of them is reachable that way: `population: "@tooling"` is `tooling/src/` (contract/population.ts
// POPULATION_ROOTS), and `vitest.config.ts` is a REPO-ROOT file that no population root contains — the same
// fact `tooling-runner-config-literals` was built around ("NO population reaches a repo-root file"). So ARM B's
// visitor filtered `relativePath !== "vitest.config.ts"`, a test that could never be false, and the arm
// judged nothing on the real tree. Its own proof rows are what said so out loud: `mustFlag[2]` and
// `mustPass[1]` plant `vitest.config.ts` alone and `policy-conformance` refused them with "expression
// admitted zero paths from 1 candidate(s)" — a declared row the population could not admit.
// ARM B now reads the config through the `exact-file` resource `vitest-config` (already a closed id with
// `tooling-runner-config-literals` as its first consumer) and walks the SAME StringLiteral predicate over
// `parseStaticSourceText`'s scratch parse of the delivered text, so the judgment is unchanged and only its
// door moved. `analysis` is therefore `resource`, which makes every proof row `mode: "resource"` — and each
// row plants BOTH subjects, because `@tooling` admitting zero paths is itself a refusal.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { literalsContaining, parseStaticSourceText } from "../lib/config-static-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const TEST_KINDS = "tooling/src/_shared/test-kinds.ts";
const VITEST_CONFIG = "vitest.config.ts";

/** Suffixes that belong to Playwright, never vitest. */
const BROWSER_SUFFIXES = [".ct.tsx", ".spec.ts"];
const BROWSER_FAMILIES = new Set(["component", "e2e"]);

const MESSAGE =
  "browser-mode test suffixes (.ct.tsx, .spec.ts) must not appear in vitest project includes — " +
  "vitest cannot execute Playwright CT or e2e files and the import hangs the worker; " +
  "tooling/src/_shared/test-kinds.ts RUNTIME_BY_FAMILY is the one home for runner assignment";

const FIX = "ensure RUNTIME_BY_FAMILY maps component to playwright-ct and e2e to playwright-e2e, and that no vitest include glob matches a browser suffix";

/** ARM B is blind to a config it cannot parse, and says so rather than reading it as clean — the same
 *  posture `tooling-runner-config-literals` takes over the same file. */
const UNPARSEABLE =
  "vitest.config.ts does not parse, so its include globs cannot be judged — the browser-suffix arm is blind to this file until it parses again";

/** ARM A: check if a RUNTIME_BY_FAMILY property maps a browser family to vitest. */
function checkFamilyMapping(node: MorphNode): string | null {
  if (!Node.isPropertyAssignment(node)) {
    return null;
  }
  const name = node.getName();
  if (!BROWSER_FAMILIES.has(name)) {
    return null;
  }
  const initializer = node.getInitializer();
  if (initializer === undefined || !Node.isStringLiteral(initializer)) {
    return null;
  }
  const value = initializer.getLiteralText();
  if (value !== "vitest" && value !== "vitest-typecheck") {
    return null;
  }
  return name;
}

export const gate = defineGate({
  id: "playwright-lane-outside-fast-check",
  family: "playwright-lane-outside-fast-check",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "exact-file", id: "vitest-config" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const findings: { node: MorphNode; detail: string; token: string }[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node, sourceFile) => {
            if (ctx.relativePath(sourceFile) !== TEST_KINDS) {
              return;
            }
            const family = checkFamilyMapping(node);
            if (family !== null) {
              findings.push({
                node,
                detail: `RUNTIME_BY_FAMILY maps "${family}" to a vitest runner instead of its playwright runner`,
                token: family,
              });
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "playwright-lane-boundary", members: ctx.files.length, unresolved: 0 });
        for (const { node, detail, token } of findings) {
          ctx.report.node(node, { message: `${MESSAGE} — ${detail}`, fix: FIX, token, offset: 0 });
        }
        // ARM B. Population resolution already refused a non-ready fact before `create`, so an absent
        // `vitest.config.ts` is the door's own tool error rather than a silent clean arm here.
        const config = readyResourceValue(ctx.resources.exactFiles(["vitest-config"])).get("vitest-config");
        if (config === undefined) {
          throw new Error("exact-file vitest-config was declared ready but is absent from the delivered map");
        }
        ctx.receipt({ kind: "resource", source: VITEST_CONFIG, resources: 1, unresolved: 0 });
        const read = parseStaticSourceText(config.path, config.text);
        if (read.kind === "unparseable") {
          ctx.report.file(config.path, { line: 1, column: 1, message: `${UNPARSEABLE} (${read.detail}).`, fix: FIX });
          return;
        }
        // THE WALK LIVES IN `lib/config-static-read.ts`, never here: `policy-soundness`'s `direct-walk` arm
        // forbids a gate module calling `getDescendantsOfKind`, and the shared reader is where the one
        // scratch parser already is. Comments are excluded structurally, which matters for this subject —
        // `vitest.config.ts`'s own header names the suffixes it must never include.
        for (const { line, needle } of literalsContaining(read.sf, BROWSER_SUFFIXES)) {
          ctx.report.file(config.path, {
            line,
            column: 1,
            token: needle,
            message: `${MESSAGE} — vitest config include glob contains browser suffix "${needle}"`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: subjects({ kinds: runtimeMap({ component: "vitest" }) }),
      expect: { count: 1, token: "component" },
      why: "a browser family (component) mapped to vitest would hang the worker in browser-mode negotiation — the founding defect shape",
    },
    {
      mode: "resource",
      files: subjects({ kinds: runtimeMap({ e2e: "vitest" }) }),
      expect: { count: 1, token: "e2e" },
      why: "the e2e family mapped to vitest is the same browser-hang defect as the component arm",
    },
    {
      mode: "resource",
      files: subjects({ config: 'const include = ["tests/**/*.ct.tsx"];\n' }),
      expect: { count: 1, token: ".ct.tsx", messageIncludes: "browser suffix" },
      why: "a vitest include glob containing .ct.tsx would pull Playwright CT files into the vitest runner. THE ROW THAT WAS UNRUNNABLE (#2393): it plants a REPO-ROOT file, which `@tooling` cannot admit, so it is the row that proved ARM B had no door — and it is the row that dies if ARM B stops reading its exact-file resource",
    },
    {
      mode: "resource",
      files: subjects({ config: 'const include = ["tests/e2e/**/*.spec.ts"];\n' }),
      expect: { count: 1, token: ".spec.ts", messageIncludes: "browser suffix" },
      why: "the OTHER browser suffix: an e2e .spec.ts glob in the vitest config is the same defect as the CT one, and the pair is what keeps BROWSER_SUFFIXES from narrowing to a single member unnoticed",
    },
    {
      mode: "resource",
      files: subjects({ config: "export default { test: {\n" }),
      expect: { count: 1, line: 1, messageIncludes: "does not parse" },
      why: "an UNPARSEABLE config is REPORTED, never skipped: its text arrived through the declared resource, so the door served it, and a silent skip would retire ARM B for the one file it judges",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: subjects(),
      why: "the sanctioned shape in both subjects — every browser family goes to its playwright runner, and the config's include globs carry only node-runner suffixes",
    },
    {
      mode: "resource",
      files: subjects({ config: 'const include = ["tests/**/*.test.ts", "tests/**/*.int.test.ts"];\n' }),
      why: "vitest include globs containing only node-runner suffixes are the sanctioned shape",
    },
    {
      mode: "resource",
      files: subjects({ config: 'const dom = ["tests/**/*.dom.test.ts"];\nconst typed = ["tests/**/*.test-d.ts"];\n' }),
      why: "THE FALSE-POSITIVE CONTROL: `.dom.test.ts` is a browser-SUBJECT suffix that runs in Node, and `.test-d.ts` is a typecheck kind — neither is a Playwright suffix, and a predicate widened to 'anything dom/browser-ish' reds here",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [TEST_KINDS]: runtimeMap() },
      expect: { messageIncludes: "exact-file:vitest-config is missing" },
      why: "THE SUPPLY REFUSAL (law §6.3): mustPass[0] minus `vitest.config.ts`. ARM B's one subject is a declared exact-file resource, so its absence refuses the owner at the population phase — never a clean ARM B over a config nobody read",
    },
  ],
});

/** The RUNTIME_BY_FAMILY map every ARM A row plants, with the named families overridden. Spelled here
 *  rather than per row so a row states only its defect. */
function runtimeMap(overrides: { readonly component?: string; readonly e2e?: string } = {}): string {
  return [
    "const RUNTIME_BY_FAMILY = {",
    '  unit: "vitest",',
    '  integration: "vitest",',
    '  contract: "vitest",',
    '  type: "vitest-typecheck",',
    `  component: "${overrides.component ?? "playwright-ct"}",`,
    `  e2e: "${overrides.e2e ?? "playwright-e2e"}",`,
    "} as const;",
    "",
  ].join("\n");
}

/** BOTH SUBJECTS ON EVERY ROW, and neither is optional. `vitest.config.ts` is a DECLARED exact-file
 *  resource, so an absent one refuses the whole fact at the population phase and drowns the row under test;
 *  `tooling/src/_shared/test-kinds.ts` is the only `@tooling` member a row plants, so without it the
 *  population admits zero paths and refuses for the opposite reason. Defaults are the sanctioned shapes. */
function subjects(overrides: { readonly kinds?: string; readonly config?: string } = {}): Record<string, string> {
  return {
    [TEST_KINDS]: overrides.kinds ?? runtimeMap(),
    [VITEST_CONFIG]: overrides.config ?? 'const include = ["tests/**/*.test.ts"];\n',
  };
}
