// Gate: sanctioned-css-homes (client-architecture-lockdown.md §4 + §16 G14) — the paint law's path-closed
// backstop. Every repository-owned product stylesheet under packages/** must be one of the five
// authored/generated CSS homes; the DTCG token source completes the six-home set. TWO-SIDED: an extra CSS
// path is RED, and so is a sanctioned home that is missing or is not a regular file.
//
// FAMILY: `css-home-topology`, the shared reader `lib/css-home-topology.ts#SANCTIONED_CSS_HOMES` /
// `#SANCTIONED_CSS_STYLESHEETS`, with `playwright-css-topology` as the other member. This policy asks
// WHICH HOMES MAY EXIST; its sibling asks WHICH HOMES THE FRONT DOORS MUST REACH. Two questions, one
// closed list, and the list was moved out of this module by #2096 precisely so the sibling could stop
// importing a gate module.
//
// POPULATION PORT: an INTENTIONAL WIDENING, legacy at eba8ef526. The legacy descriptor ran its own
// `readdirSync` recursion from `<root>/packages` and skipped `GENERATED_DIRS = {dist, node_modules}`. The
// final declares `authored-tree:packages`, whose reader excludes `NON_AUTHORED_DIRECTORIES = {node_modules,
// .git, dist, .cache}` (`ops/resource-reader.ts`) — a strict SUPERSET, so `.git` and `.cache` are newly
// excluded. Measured on this tree: no `.css` lives under either, so the admitted set is byte-identical
// today and the widening is a statement about what a future `.cache/**/*.css` would do (it would be
// invisible here, correctly — a cache is not authored). Two further deltas, both deliberate:
// (1) THE ANCHOR GUARD IS RETIRED. The legacy `existsSync(<root>/package.json)` early return existed
//     because a conformance fixture could not be told from a gutted checkout. Under the resource contract a
//     fixture SUPPLIES its whole tree, so the question no longer exists: an ABSENT or EMPTY `packages` tree
//     is a population-phase REFUSAL (`mustRefuse`), and a tree holding one unrelated file is a tree that is
//     missing all six homes (`mustFlag[4]`, count 6). The legacy `mustPass` asserting the opposite of that
//     last row was the anchor guard's proof and is retired WITH it, as an assertion rather than an absence.
// (2) THE MISSING-HOME ANCHOR MOVED off this gate's own source file. `tooling/src/verify/gates/…` is in no
//     resource population this policy declares, so `ctx.report.file` would THROW on it (guide §3's
//     absent-verdict rule). The anchor is now `lib/absent-subject-anchor.ts#subjectAnchor` — the missing
//     home's own path when it is present-but-not-a-file, else the first present sanctioned home, else the
//     lowest admitted path — and the missing NAME moved into the message, where it was always the
//     load-bearing half.
//
// AUTHORITY: `hard`. Both arms report a path with NO token (an extra stylesheet is a whole-file verdict; a
// missing home has no source text at all), so `locateFinding` could never bind an ordinary position — and
// the subject is a REGISTRY decision, not a site an author may absolve. The legacy engine's bare
// `@orb-gate-ignore sanctioned-css-homes` door DID exist and does NOT survive the conversion; the marker
// census that makes that free is 0 live markers (measured 2026-09-12 over 7,725 tracked source files with a
// 1,196-hit positive control, `css-family-audit-2026-09-12.md`).
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A missing/empty declared tree makes
// `resolveResourceDeclarations` THROW at the POPULATION phase and withholds this owner before `create`
// runs (guide §11 ruling 3), so this module owns no not-ready branch and reads through
// `readyResourceValue`. Both reachable statuses are pinned, in DIFFERENT HOMES, and the split is
// structural rather than a gap (corrected #2294 — this sentence used to claim both were rows): `missing`
// is `mustRefuse[0]`; `empty` CANNOT be a row, because a proof row's substrate is a `files` MAP and a map
// has no way to spell a directory that exists with no members. Its pin is therefore a `runPolicyPass` arm
// over a real `mkdtemp` root (`css-home-topology-family.test.ts:103-115`, with `:17-23` stating the same
// reason from the test side), which is where the receipt pair lives too.
//
// DECLARED LIMITS: the closed list itself is the rule, not a fence, so every arm is carried by a row whose
// count the §4.1 cut moves. No arm of this policy is unfalsifiable.
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { SANCTIONED_CSS_HOMES } from "../lib/css-home-topology.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SANCTIONED_PATHS = new Set<string>(SANCTIONED_CSS_HOMES);
const MESSAGE = "a repository-owned product stylesheet exists outside the path-closed six-home CSS doctrine (client-architecture-lockdown.md §4)";

export const gate = defineGate({
  id: "sanctioned-css-homes",
  family: "css-home-topology",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the product CSS inventory is a closed ResourceHost tree fact, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "packages" }],
  message: MESSAGE,
  fix: "move the responsibility into its exact §4 home, or — when a required home is genuinely retired — amend client-architecture-lockdown.md §4 and lib/css-home-topology.ts together.",
  create: (ctx) => ({
    evaluate: () => {
      const files = readyResourceValue(ctx.resources.authoredTree("packages")).filter((entry) => entry.kind === "file");
      const present = new Set(files.map((entry) => entry.path));
      for (const entry of files) {
        if (entry.path.endsWith(".css") && !SANCTIONED_PATHS.has(entry.path)) {
          ctx.report.file(entry.path, { line: 1, column: 1, message: MESSAGE });
        }
      }
      // A DIRECTORY at an exact home path is a missing home, not a present one — which is why the test is
      // membership in the FILE set rather than in the tree. The legacy descriptor asked `statSync(...)
      // ?.isFile()` for the same reason and its `mustFlag[4]` (`theme.css/keep`) pins it on both sides.
      const anchor = subjectAnchor(present, [...SANCTIONED_CSS_HOMES]);
      for (const home of SANCTIONED_CSS_HOMES) {
        if (!present.has(home)) {
          ctx.report.file(anchor(home), {
            line: 1,
            column: 1,
            message: `sanctioned CSS home missing or not a regular file: ${JSON.stringify(home)} — remove it only when the authority changes (client-architecture-lockdown.md §4)`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
        "packages/client/src/features/thing/thing.css": ".thing { color: red; }\n",
      },
      // Every fixture below supplies the COMPLETE six-home set beside its violation, so the count isolates
      // the arm the `why` names. Without them the missing-home loop fires up to six more times and `count`
      // would be ratifying two arms under a one-finding claim (the `server-layout` mustFlag[0] shape).
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "a feature-local stylesheet is an unsanctioned seventh product CSS home",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
        "packages/ui/src/styles/extra.css": ".extra { color: red; }\n",
      },
      expect: { count: 1, messageIncludes: "outside the path-closed six-home" },
      why: "an extra stylesheet beside an approved UI home is still outside the literal closed set",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
        "packages/ui/src/styles/.extra.css": ".extra { color: red; }\n",
        "packages/ui/src/.hidden/extra.css": ".extra { color: red; }\n",
      },
      expect: { count: 2, messageIncludes: "outside the path-closed six-home" },
      why: "a dotfile stylesheet and one under a dot-directory cannot disappear from the closed-set inventory — the authored reader excludes .git and .cache by name, never every dotted path",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css/keep": "directory fixture\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
      },
      // The anchor is the FIRST PRESENT sanctioned home (`tokens.json`), never the absent `theme.css` and
      // never this gate's own source file — the legacy anchor, which `ctx.report.file` would now THROW on.
      expect: { count: 1, messageIncludes: 'sanctioned CSS home missing or not a regular file: "packages/ui/src/styles/theme.css"' },
      why: "a directory at an exact required path is not the required regular file, and its absence verdict anchors on a PRESENT home",
    },
    {
      mode: "resource",
      files: { "packages/client/src/features/chat/thing.tsx": "export const thing = true;\n" },
      // THE STALE ARM, and the retired anchor guard's successor. Legacy this fixture was a `mustPass`: the
      // `existsSync(package.json)` guard read a partial synthetic tree as "not the real repository" and
      // acquitted. A resource fixture IS its whole tree, so the honest verdict is six missing homes, one per
      // member of the closed set — `count: 6` pins that the loop counts every member rather than stopping at
      // the first, and the anchor falls all the way through to the lowest admitted path.
      expect: { count: 6, messageIncludes: "sanctioned CSS home missing" },
      why: "a real tree with none of the six homes fails loudly, one finding per home, instead of returning a vacuous clean",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
      },
      why: "all six exact product homes and nothing else is the clean two-sided verdict",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/tokens/tokens.json": "{}\n",
        "packages/ui/src/styles/theme.css": "@layer theme {}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell { display: grid; }\n",
        "packages/ui/dist/generated.css": ".generated { color: red; }\n",
        "packages/ui/node_modules/vendor/vendor.css": ".vendor { color: red; }\n",
        "packages/ui/.cache/warm.css": ".warm { color: red; }\n",
      },
      why: "generated dist output, vendored node_modules CSS and a .cache artifact are all outside the AUTHORED inventory — the last is the widening this port declares",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { "package.json": "{}\n" },
      // The other side of `mustFlag[4]`'s boundary, and the reason the legacy anchor guard could retire: NO
      // packages tree at all is a refusal — "I could not judge" — never the six-missing-homes verdict a
      // tree with one file earns. A legacy descriptor answered both cases with the same silent return.
      expect: { messageIncludes: "authored-tree:packages is missing" },
      why: "an absent packages tree refuses at the population phase instead of reporting six vanished homes",
    },
  ],
});
