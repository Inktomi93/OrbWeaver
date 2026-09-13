// Policy: policy-family-readers — a `family` is a SHARED READER, not a shared topic (#2187; §5b criterion 4;
// family `policy-soundness`, reader `lib/policy-descriptor-read.ts`).
//
// THE RULE. §5b criterion 4: *"The family is a real shared `lib/` reader (module + function, named in the
// header) or a declared singleton with its reason. A theme, a filename prefix and a shared topic are not
// families."* Two policies carrying the same `family` string while computing their subjects from two private
// walks are not a family — they are two policies that agreed on a word, and the word is what a reader trusts
// when it asks "who else answers this question the same way". THIS MODULE ENFORCES THE IMPORT HALF ONLY: that
// a member imports a `tooling/src/verify/lib/` module at least one SIBLING also imports. Whether that module
// is the reader the family actually shares, whether its FUNCTION is named in the header, and whether a
// singleton's reason is a real reason all stay a hand read (§5b's own instruction: items 4/5 are judgment).
// The arm proves the import. It is the half a machine can hold, and holding it is what keeps the other half
// from being the only thing between the corpus and a theme.
//
// ═══ WHY THE MEMBER READING AND NOT THE FAMILY READING — the fork, and both numbers ═══
//
// The audit that ordered this module (`policing-surface-audit-2026-09-12.md` §RECOMMENDED ADDITIONS #5)
// counted FAMILIES under an INTERSECTION reading: a family is split when NO lib/ module is imported by ALL of
// its members. That census read 14 before the #2096/#2162 migration. RE-MEASURED on this tree (`3b68aa44e`,
// 250 final policies in 154 families, 47 of them multi-member): 9 families under the intersection reading, 11
// MEMBERS under the reading this module implements.
//
// The intersection reading cannot be what a policy enforces, and its own worst case is this policy's family.
// `policy-soundness` has nine members; EIGHT of them import `lib/policy-descriptor-read.ts`. The ninth
// (`policy-fixture-substrate`) does not — it shares `lib/reference-fact.ts` with three siblings instead. Under
// intersection the family has no common module and ALL NINE are accused, eight of them for a fact about a
// module they do not contain. That is the false-accusation shape #2274 was just paid for one file over: a
// reader whose unresolved case convicts the correct majority. So the enforced predicate is per MEMBER:
//
//   a `lib/` module is COMMON to a family when at least TWO of its members import it;
//   a member of a multi-member family that imports no COMMON module is reported.
//
// It is the same law read where the fix lives. An isolated member is exactly the module whose author has to
// act, the finding sits in that module's file where its waiver can sit too, and the family-level statement
// ("this family shares a reader") is the conjunction of the member statements plus the hand read §5b already
// requires. Both numbers are recorded above on purpose: a future lane comparing this policy's count against
// the audit's 14 must know it is comparing two different questions.
//
// ═══ SEVERITY: `ordinary` / `warning` + `workItem` NOW ═══
//
// 11 live members at mint, so `hard`/`error` in this commit would be 11 blocking findings and a stop rather
// than a burn-down; and `hard` + `warning` is REFUSED AT LOAD (`lib/policy-validation.ts`, #2025) — there is
// no soft `hard` landing. The #2184 transitional ruling therefore applies unchanged: `ordinary` + `warning`
// with a live `workItem`, flipped to `hard`/`error` IN THE COMMIT that takes this policy's own effective count
// to ZERO on a whole-corpus run. The count IS the burn-down and it is readable off
// `reports/check-structure.json`, so the flip condition is a checkable event rather than a remembered
// intention. The `ordinary` door is watched the same way its sibling's is: a waiver moves the per-policy
// `waived` count `pnpm check:structure-delta` (#2110) prints before → after.
//
// WHAT THIS DOES NOT DO, so nobody adds it. It does not forbid the sibling-gate import — `policy-legacy-imports`
// ARM B owns that, and a second copy of the nine forbidden homes here would be the re-spelling this family
// reports. It follows that a member could satisfy this policy by importing a FORBIDDEN lib home; that is not a
// hole, it is two policies with one verdict each, and the forbidden import reds under its own id in the same
// run. It does not read the header, the reader's FUNCTION, or a singleton's reason (§5b items 4/5 are a hand
// read, and a policy that guessed at prose would be the false clean the guide warns about). And it does not
// judge a SINGLETON at all: a family of one has no sibling to share with, so it is out of the population by
// construction rather than by an exemption anybody maintains.
//
// IDENTITY, NOT SPELLING. A door's target is resolved (`getModuleSpecifierSourceFile`) and kept only when the
// resolved path is under `tooling/src/verify/lib/`, which is the shape `policy-legacy-imports` established one
// module over: `../lib/x.ts` and `../../verify/lib/x.ts` are the same reader, and a specifier-keyed census
// would call them two. An UNRESOLVABLE door is simply not a lib import — it cannot acquit, so the failure
// direction is toward the finding, which is this policy's fail-closed side.
//
// §4.1 NARROWING MATRIX (measured on this module's own rows; each cut names the row that dies):
//   `lib/` home fence          → the founding `mustFlag` (both members import `../contract/policy.ts`; admit
//                                any relative door and the pair "shares" the contract and goes green)
//   COMMON means ≥ 2 members   → the three-member outlier `mustFlag` (count it at ≥ 1 and a member's own
//                                private reader acquits it)
//   multi-member families only → the singleton `mustPass` (drop the ≥ 2 test and a family of one is accused)
//   resolved-target identity   → the parent-directory-spelling `mustPass` (key on the specifier text and the
//                                same reader read through `../../verify/lib/` stops matching)
//
// FAMILY: `policy-soundness`, shared reader `lib/policy-descriptor-read.ts` (`finalDescriptorOf`,
// `descriptorProperty`, `descriptorValue`) — the same descriptor reader `policy-refusal-coverage`,
// `policy-waiver-identity` and `policy-waiver-spelling` resolve through, which is also why this module is not
// its own counterexample. It is one more policy under the shared string rather than a `-health` split: it
// differs from its siblings in SUBJECT (the family's reader, rather than a waiver arm or a refusal pin), not
// in authority.
// POPULATION PORT: NO legacy population — BORN FINAL under #2187. No legacy descriptor ever asked whether a
// family shared a reader; the concept did not exist before `defineGate` carried a `family` field. There is no
// legacy SHA to record.
//
// BLINDNESS: the whole verdict rests on reading `family` off final descriptors through the shared reader. If
// that recognizer dies, every module reads "not final", the population collapses to nothing and this policy
// reports ✓ over the corpus forever. It self-anchors on its OWN path and THROWS instead — the same tripwire
// its `policy-refusal-coverage` sibling carries, for the same reason.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf, staticText } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, ORDINARY_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-family-readers.ts";
const GATES_DIR = "tooling/src/verify/gates/";
/** The shared-reader home. A door is a candidate only when its RESOLVED target lands here. */
const LIB_DIR = "tooling/src/verify/lib/";
const FAMILY_FIELD = "family";
/** A module is COMMON to its family at two members; one member importing it is a private reader. */
const SHARED_BY = 2;

const MESSAGE =
  "a FAMILY MEMBER SHARES NO READER WITH ITS SIBLINGS — this module carries a `family` string that another final policy also " +
  "carries, and it imports no `tooling/src/verify/lib/` module any sibling imports (gate-runtime-standardization.md §7 item 4: " +
  "*a theme, a filename prefix and a shared topic are not families*). A family whose members compute their subjects from separate " +
  "private walks answers its shared question two ways, and the word `family` is what the next lane trusts when it asks who else " +
  "answers it the same way. Measured at mint: 11 members across 6 families.";
const FIX =
  "Move the computation the family shares into `tooling/src/verify/lib/<family>.ts` and import it from BOTH modules (#2096), then name the " +
  "module AND the function in this module's header (§5b criterion 4 — the import is what this policy reads; the function name and the " +
  "reader's fitness are the hand read beside it). If the two policies do NOT in fact share a computation, they are not a family: give this " +
  "module its own `family` string (a family of one is out of this population by construction) and record the singleton decision and its " +
  "reason in the header. Never satisfy this by importing the sibling GATE module — `policy-legacy-imports` ARM B forbids exactly that, and " +
  "it is the shape this rule exists to route away from. " +
  // THE ESCAPE HATCH, SPELLED EXACTLY — the position is the token this policy reports, which is the `family`
  // property that created the obligation (see `judgeFamilies`). A `fix` promising a waiver without naming the
  // position is a promise the operator cannot act on, and it is the shape `policy-waiver-spelling` reds.
  "While the burn-down drains this policy is `ordinary`, so a deliberate deferral can be waived at the reported field: " +
  "`// @orb-waive policy-family-readers(family): <reason and its end condition>`. The position is ALWAYS `family`, never a path, a line " +
  "number or the family's own string.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the descriptor reader ` +
  "(lib/policy-descriptor-read.ts finalDescriptorOf) is dead, so every module would read out of scope, the family census would collapse to " +
  "an empty corpus and this policy would report ✓ forever. Refusing the run.";

/** What the walk read: the members that declare a `family`, and how many final modules were seen at all (the
 *  receipt's subject — see `judgeFamilies`). */
interface Census {
  readonly members: readonly Member[];
  readonly finals: number;
}

/** One final module's contribution to the census: where it lives, the `family` it declares, the `lib/` modules
 *  it imports, and the property node a finding anchors on. */
interface Member {
  readonly path: string;
  readonly family: string;
  readonly libs: ReadonlySet<string>;
  readonly anchor: MorphNode;
}

/** Read the family's authored value through the same stable aliases, assertions and text composition as
 *  every other descriptor consumer. A runtime string is not necessarily a statically readable literal. */
function familyOf(descriptor: ReturnType<typeof finalDescriptorOf>): string | undefined {
  const value = descriptor === undefined ? undefined : descriptorValue(descriptor, FAMILY_FIELD);
  return staticText(value);
}

/** The repo-relative `lib/` module a door RESOLVES to, or undefined. Identity rather than spelling: the same
 *  reader reached through `../lib/` and through `../../verify/lib/` is one module, and an unresolvable door is
 *  not a lib import at all (it cannot acquit, which is the fail-closed direction here). */
function libTargetOf(door: MorphNode): string | undefined {
  const target = Node.isImportDeclaration(door) || Node.isExportDeclaration(door) ? door.getModuleSpecifierSourceFile() : undefined;
  const path = target?.getFilePath().replaceAll("\\", "/");
  const index = path === undefined ? -1 : path.indexOf(LIB_DIR);
  return index === -1 || path === undefined ? undefined : path.slice(index);
}

/** How many members of one family import each `lib/` module. A module is COMMON at `SHARED_BY` importers. */
function importerCounts(siblings: readonly Member[]): ReadonlyMap<string, number> {
  const importers = new Map<string, number>();
  for (const sibling of siblings) {
    for (const lib of sibling.libs) {
      importers.set(lib, (importers.get(lib) ?? 0) + 1);
    }
  }
  return importers;
}

/** The members of ONE family that import no COMMON module. A family below `SHARED_BY` members has no sibling
 *  to share with and is never asked. */
function isolatedIn(siblings: readonly Member[]): readonly Member[] {
  if (siblings.length < SHARED_BY) {
    return [];
  }
  const importers = importerCounts(siblings);
  return siblings.filter((sibling) => ![...sibling.libs].some((lib) => (importers.get(lib) ?? 0) >= SHARED_BY));
}

/** Every final module in the population, with the `family` it declares and the `lib/` modules it imports.
 *  A module in the gate corpus that does not read as final is out of scope — EXCEPT this one, whose absence
 *  means the descriptor reader died and the whole census is a placebo (see BLINDNESS above). */
function census(ctx: GatePolicyContext, libsByPath: ReadonlyMap<string, ReadonlySet<string>>): Census {
  const members: Member[] = [];
  let finals = 0;
  for (const sourceFile of ctx.files) {
    const path = ctx.relativePath(sourceFile);
    if (!path.startsWith(GATES_DIR)) {
      continue;
    }
    const descriptor = finalDescriptorOf(sourceFile);
    if (descriptor === undefined) {
      if (path === SELF) {
        throw new Error(BLIND);
      }
      continue;
    }
    finals += 1;
    // A missing field is a loader error. A present but unreadable field may be a valid runtime string;
    // omitting it could turn another member into a singleton and falsely complete a partial census.
    const family = familyOf(descriptor);
    const anchor = descriptorProperty(descriptor, FAMILY_FIELD);
    if (descriptor.getProperty(FAMILY_FIELD) === undefined) {
      continue;
    }
    if (family === undefined || anchor === undefined) {
      throw new Error(`family census cannot resolve the declared family in ${path}; refusing the incomplete family census`);
    }
    members.push({ path, family, libs: libsByPath.get(path) ?? new Set<string>(), anchor });
  }
  return { members, finals };
}

/** Group the census by `family` and report every member of a MULTI-MEMBER family that imports no module at
 *  least one sibling also imports. */
function judgeFamilies(ctx: GatePolicyContext, { members, finals }: Census): void {
  const byFamily = new Map<string, Member[]>();
  for (const member of members) {
    byFamily.set(member.family, [...(byFamily.get(member.family) ?? []), member]);
  }
  for (const [, siblings] of byFamily) {
    for (const isolated of isolatedIn(siblings)) {
      ctx.report.node(isolated.anchor, { token: FAMILY_FIELD, offset: 0 });
    }
  }
  // THE RECEIPT COUNTS EVERY FINAL MODULE THE WALK READ — not the multi-member subset and not even the
  // family-carrying subset. MEASURED (the family test's self-anchor arm): a receipt over the members would
  // refuse at zero on a corpus whose single final module declares no `family`, and `count === 0` becomes a
  // receipt REFUSAL (#1966), turning a legitimate corpus state into a tool error. A corpus of singletons — or
  // of one contract-incomplete module — is a real tree; blindness is about what was SCANNED.
  ctx.receipt({ kind: "population", source: "final policy modules", members: finals });
}

const PROBE_ID = "probe";
/** A shared `lib/` reader planted beside the fixtures — a real module the doors can RESOLVE to, because an
 *  unresolvable specifier is not an import and would prove the acquittal against nothing. */
const SHARED_LIB_PATH = "tooling/src/verify/lib/shared-probe.ts";
const OTHER_LIB_PATH = "tooling/src/verify/lib/other-probe.ts";
const LIB_STUB = "export function readShared(value: unknown): unknown {\n  return value;\n}\n";
/** A second FINAL module in the corpus: `id`/`family` as given, importing each `libs` specifier. */
const SIBLING = (id: string, family: string, ...libs: readonly string[]): string =>
  `${libs.map((lib) => `import { readShared as ${lib.replaceAll(/[^a-z]/gu, "")} } from "${lib}";\n`).join("")}import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "${id}", family: "${family}" });\n`;
const siblingPath = (id: string): string => `${GATES_DIR}${id}.ts`;
/** The judged probe module: the ordinary trunk, a declared `family`, and whatever `lib/` doors it opens. */
const PROBE = (family: string, ...libs: readonly string[]): string =>
  finalProbeModule(
    `${ORDINARY_TRUNK}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
    libs.map((lib) => `import { readShared as ${lib.replaceAll(/[^a-z]/gu, "")} } from "${lib}";\n`).join(""),
  ).replace(`family: "${PROBE_ID}",`, `family: "${family}",`);
/** The probe with the escape hatch on the line above its `family` — the §4.2 positive identity arm's fixture.
 *  The position is the token `judgeFamilies` reports, so the marker names the coordinate the finding carries. */
const WAIVED = (family: string): string =>
  PROBE(family).replace(
    `family: "${family}",`,
    `// @orb-waive policy-family-readers(family): the planted probe defers its shared reader; ends when the family's reader lands in lib/.\n  family: "${family}",`,
  );
const LIBS = { [SHARED_LIB_PATH]: LIB_STUB, [OTHER_LIB_PATH]: LIB_STUB };

export const gate = defineGate({
  id: "policy-family-readers",
  family: "policy-soundness",
  authority: "ordinary",
  severity: "warning",
  workItem: 2187,
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] },
  analysis: "types",
  // The verdict is a CENSUS over the whole family: a narrowed selection holding one member of a pair would
  // read it as a singleton and acquit it, which is a different question from the one this policy asks.
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const libsByPath = new Map<string, Set<string>>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration],
          visit: (node, sourceFile): void => {
            const lib = libTargetOf(node);
            if (lib === undefined) {
              return;
            }
            const path = ctx.relativePath(sourceFile);
            libsByPath.set(path, (libsByPath.get(path) ?? new Set<string>()).add(lib));
          },
        },
      ],
      evaluate: (): void => judgeFamilies(ctx, census(ctx, libsByPath)),
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(
        PROBE("twin")
          .replace('family: "twin",', "family: (FAMILY as string) satisfies string,")
          .replace("import { defineGate }", 'const FAMILY = "twin";\nimport { defineGate }'),
        {
          ...LIBS,
          [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
        },
      ),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "A const family value inside as/satisfies wrappers is the same family as the literal sibling. Dropping the nonliteral member from the census must not turn the pair into a clean singleton.",
    },
    {
      mode: "types",
      files: familyFixture(
        PROBE("twin")
          .replace('family: "twin",', "family,")
          .replace("import { defineGate }", 'import { FAMILY as family } from "../lib/family-probe.ts";\nimport { defineGate }'),
        {
          ...LIBS,
          "tooling/src/verify/lib/family-probe.ts": 'export const FAMILY = "twin";\n',
          [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
        },
      ),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "An imported constant used through an alias and a shorthand property retains both its family identity and its report anchor. The extra family-value import is private to the probe, so it cannot acquit either member.",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("twin"), { ...LIBS, [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts") }),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "THE FOUNDING SHAPE and the live class (11 members across 6 families at mint): two policies carrying one `family` string with no `lib/` module between them. BOTH are reported, and that is the rule read honestly — sharing is symmetric, so a pair in which only one member imports a reader shares nothing, and the census counts exactly this way (`no-inline-types`, `no-raw-egress`, `registry-assembly-at-door-only`, `scrubber-home`, `windowed-infinite-query` are all this shape). THE `lib/` HOME FENCE DIES HERE: every final module imports `../contract/policy.ts` for `defineGate`, so admitting any relative door would make this pair 'share' the contract and turn the row green",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("trio", "../lib/other-probe.ts"), {
        ...LIBS,
        [siblingPath("trio-a")]: SIBLING("trio-a", "trio", "../lib/shared-probe.ts"),
        [siblingPath("trio-b")]: SIBLING("trio-b", "trio", "../lib/shared-probe.ts"),
      }),
      expect: { count: 1, token: FAMILY_FIELD },
      why: "THE OUTLIER, and the row that holds `COMMON means ≥ 2 MEMBERS`: two siblings share `lib/shared-probe.ts` and the third imports a `lib/` module NOBODY else does. Its own private reader must not acquit it — count a module as common at ≥ 1 importer and this row goes green, which is the whole difference between 'imports something from lib/' and 'shares a reader'. Exactly ONE finding: the two connected members are clean, which is also why this policy reads per MEMBER and not per family (the intersection reading accuses all three)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(
        PROBE("twin", "../lib/shared-probe.ts")
          .replace('family: "twin",', "family,")
          .replace("import { defineGate }", 'const family = ("tw" + "in") satisfies string;\nimport { defineGate }'),
        {
          ...LIBS,
          [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
        },
      ),
      why: "A readable shorthand/concatenated family still passes when both members share a reader; the repair must resolve admitted values, never ban every nonliteral family.",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("twin", "../lib/shared-probe.ts"), {
        ...LIBS,
        [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
      }),
      why: "THE SHAPE THE RULE ASKS FOR: both members of the family import the same `lib/` reader. This is §5b criterion 4's import half satisfied — the function they call and whether the header names it are the hand read beside this policy, deliberately not asserted here",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("twin", "../../verify/lib/shared-probe.ts"), {
        ...LIBS,
        [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
      }),
      why: "IDENTITY, NOT SPELLING: the same reader reached through the parent directory. The door's target is RESOLVED and its repo-relative path is the census key, so `../lib/x.ts` and `../../verify/lib/x.ts` are one module — key the census on the specifier text and this row alone reds. The same arm `policy-legacy-imports` proves one module over, for the same reason",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("lonely"), { ...LIBS, [siblingPath("elsewhere")]: SIBLING("elsewhere", "other-family", "../lib/shared-probe.ts") }),
      why: "A SINGLETON IS OUT OF THE POPULATION BY CONSTRUCTION, not by an exemption anybody maintains: a family of one has no sibling to share a reader with, so the question does not arise and the module is never asked. Drop the `>= SHARED_BY` members test and this row reds — a lone policy would be accused of not sharing with nobody. §5b's 'declared singleton with its reason' is the header half of the same decision, and it stays a hand read",
    },
    {
      mode: "types",
      files: familyFixture(WAIVED("trio"), {
        ...LIBS,
        [siblingPath("trio-a")]: SIBLING("trio-a", "trio", "../lib/shared-probe.ts"),
        [siblingPath("trio-b")]: SIBLING("trio-b", "trio", "../lib/shared-probe.ts"),
      }),
      why: "THE §4.2 POSITIVE IDENTITY ARM, in-module — and it is the THREE-member fixture on purpose: in a PAIR both members are accused (sharing is symmetric), so the marker in one file would leave the sibling's finding standing and the row would be red for a reason that has nothing to do with waiver identity. Two connected siblings plus the waived outlier isolates the one finding the marker must suppress. the correct `@orb-waive policy-family-readers(family)` marker at the REPORTED position suppresses the finding, which is what makes the `ordinary` tier's escape hatch real rather than a promise in `fix` prose. Its discrimination control (a marker naming a DEAD position must ALARM) lives in the family test through `runPolicyPass`, because §4.2 forbids a negative arm here: under `knownPolicies: [policy]` it would ride the unknown-policy short-circuit and prove nothing",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: familyFixture(
        PROBE("twin")
          .replace('family: "twin",', "family: chooseFamily(),")
          .replace("import { defineGate }", 'function chooseFamily(): string { return "other"; }\nchooseFamily = (): string => "twin";\nimport { defineGate }'),
      ),
      expect: { messageIncludes: "family census cannot resolve the declared family" },
      why: "A reassigned text function does not prove its original family value. The production family census must withhold instead of trusting the body of a declaration the call may no longer denote.",
    },
    {
      mode: "types",
      files: familyFixture(
        PROBE("twin")
          .replace('family: "twin",', "family: chooseFamily(),")
          .replace("import { defineGate }", "declare function chooseFamily(): string;\nimport { defineGate }"),
      ),
      expect: { messageIncludes: "family census cannot resolve the declared family" },
      why: "A present but unreadable family can change another module from sibling to singleton. The entire-population census must withhold instead of declaring the remaining partial census complete.",
    },
  ],
});
