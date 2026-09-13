// Policy: policy-family-readers — each member of a multi-member family must share a canonical production
// dependency with a sibling. Family `policy-soundness`, reader `lib/policy-descriptor-read.ts`.
//
// Production roots are the descriptor's create function and source-reachable callbacks, callable helpers,
// and stable derived values. The shared reader resolves canonical declarations, including callable/fact
// identities and subject/vocabulary data; importing the same file, proof-builder-only use, and erased type
// references do not establish consumption. The declaration must live in the shared verify/lib home.
//
// This proves source reach and identity, not semantic fitness or branch execution on every input. A reviewer
// must still establish that the shared computation or subject makes this a meaningful family (§2/§7).
// Canonical data consumed by the context-definition-shape and sub-floor-disclosure families is intentional;
// manufacturing wrapper functions around it would prove only a spelling. No current-consumer roster is policy.
//
// The predicate is per member: a dependency shared by any two siblings connects those members. Requiring one
// dependency common to every member would accuse connected siblings for an unrelated outlier. Singletons
// have no partner and remain outside this question; their meaningful singleton reason is review-owned.
//
// Whole-population ordinary/warning transition, workItem2187: retain the complete census while its findings
// drain, then promote to hard/error at the tested final chunk (§5). A partial or unreadable family census
// refuses. The self-registration pin prevents a dead descriptor reader from certifying an empty census.
import type { Node as MorphNode, ObjectLiteralExpression } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf, policyProductionDependencies, rootOf, staticText } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, ORDINARY_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-family-readers.ts";
const GATES_DIR = "tooling/src/verify/gates/";
/** The governed shared-reader home; a dependency must resolve to a declaration here. */
const LIB_DIR = "tooling/src/verify/lib/";
const FAMILY_FIELD = "family";
/** Sharing requires two distinct family members, irrespective of each member's reference count. */
const SHARED_BY = 2;

const MESSAGE =
  "the family reader resolves no shared canonical production dependency for this member (gate-runtime-standardization.md §2/§7). " +
  "Its create function and source-reachable helpers must consume a declaration in tooling/src/verify/lib/ that another family member consumes. " +
  "A common module import, proof-only reference, or type-only reference does not establish production sharing. " +
  "This check proves source reach and identity; the dependency's semantic fitness for the family still requires review.";
const FIX =
  "Share the meaningful computation or canonical subject/vocabulary declaration in tooling/src/verify/lib/ and consume it from production hooks. " +
  "If the policies answer unrelated questions, give this member its own family and record the singleton reason. " +
  "Do not add an unused import or a nominal wrapper to satisfy this check. During the warning transition, a deliberate deferral uses " +
  "`// @orb-waive policy-family-readers(family): <reason and its end condition>` at the reported family property.";
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

/** One final module's family, canonical production dependencies, and finding anchor. */
interface Member {
  readonly path: string;
  readonly family: string;
  readonly dependencies: ReadonlySet<object>;
  readonly anchor: MorphNode;
}

/** Read the family's authored value through the same stable aliases, assertions and text composition as
 *  every other descriptor consumer. A runtime string is not necessarily a statically readable literal. */
function familyOf(descriptor: ReturnType<typeof finalDescriptorOf>): string | undefined {
  const value = descriptor === undefined ? undefined : descriptorValue(descriptor, FAMILY_FIELD);
  return staticText(value);
}

/** Count canonical declarations, not import spellings or files; one member contributes at most once. */
function consumerCounts(siblings: readonly Member[]): ReadonlyMap<object, number> {
  const consumers = new Map<object, number>();
  for (const sibling of siblings) {
    for (const dependency of sibling.dependencies) {
      consumers.set(dependency, (consumers.get(dependency) ?? 0) + 1);
    }
  }
  return consumers;
}

function isolatedIn(siblings: readonly Member[]): readonly Member[] {
  if (siblings.length < SHARED_BY) {
    return [];
  }
  const consumers = consumerCounts(siblings);
  return siblings.filter((sibling) => ![...sibling.dependencies].some((dependency) => (consumers.get(dependency) ?? 0) >= SHARED_BY));
}

/** Every final module in the population, with its declared family and shared production dependencies.
 *  A module in the gate corpus that does not read as final is out of scope — EXCEPT this one, whose absence
 *  means the descriptor reader died and the whole census is a placebo (see BLINDNESS above). */
function census(ctx: GatePolicyContext): Census {
  const candidates = new Map<ObjectLiteralExpression, Omit<Member, "dependencies">>();
  let root: string | undefined;
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
    root ??= rootOf(sourceFile, path);
    candidates.set(descriptor, { path, family, anchor });
  }
  const dependencies = policyProductionDependencies([...candidates.keys()]);
  const sharedHome = `${root}/${LIB_DIR}`;
  const members = [...candidates].map(([descriptor, member]) => ({
    ...member,
    dependencies: new Set(
      [...(dependencies.get(descriptor) ?? [])]
        .filter((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").startsWith(sharedHome))
        .map((declaration) => declaration.compilerNode),
    ),
  }));
  return { members, finals };
}

/** Report each member of a multi-member family without a canonical dependency shared with a sibling. */
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
const readerBinding = (lib: string): string => lib.replaceAll(/[^a-z]/gu, "");
const readerCalls = (libs: readonly string[]): string => libs.map((lib) => `${readerBinding(lib)}(1)`).join(", ");
/** A second final module whose production evaluator calls each imported reader. */
const SIBLING = (id: string, family: string, ...libs: readonly string[]): string =>
  `${libs.map((lib) => `import { readShared as ${readerBinding(lib)} } from "${lib}";\n`).join("")}import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "${id}", family: "${family}", create: () => ({ evaluate: () => [${readerCalls(libs)}] }) });\n`;
const siblingPath = (id: string): string => `${GATES_DIR}${id}.ts`;
/** The judged ordinary module calls each reader from its production visitor. */
const PROBE = (family: string, ...libs: readonly string[]): string =>
  finalProbeModule(
    `${ORDINARY_TRUNK.replace("ctx.report.node(node)", `[${readerCalls(libs)}, ctx.report.node(node)]`)}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
    libs.map((lib) => `import { readShared as ${readerBinding(lib)} } from "${lib}";\n`).join(""),
  ).replace(`family: "${PROBE_ID}",`, `family: "${family}",`);
/** The probe with the escape hatch on the line above its `family` — the §4.2 positive identity arm's fixture.
 *  The position is the token `judgeFamilies` reports, so the marker names the coordinate the finding carries. */
const WAIVED = (family: string): string =>
  PROBE(family).replace(
    `family: "${family}",`,
    `// @orb-waive policy-family-readers(family): the planted probe defers its shared reader; ends when the family's reader lands in lib/.\n  family: "${family}",`,
  );
const LIBS = { [SHARED_LIB_PATH]: LIB_STUB, [OTHER_LIB_PATH]: LIB_STUB };

/** Complete production-reference controls are separate from proof fixture construction. */
const LIVE_MEMBER = (id: string, prelude: string, create: string): string =>
  `${prelude}\nimport { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "${id}", family: "twin", create: ${create} });\n`;
const SHARED_IMPORT = 'import { readShared } from "../lib/shared-probe.ts";';

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
  create: (ctx) => ({ evaluate: (): void => judgeFamilies(ctx, census(ctx)) }),
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(LIVE_MEMBER("probe", SHARED_IMPORT, "() => ({ evaluate: () => 1 })"), {
        ...LIBS,
        [siblingPath("twin-sibling")]: LIVE_MEMBER("twin-sibling", SHARED_IMPORT, "() => ({ evaluate: () => readShared(1) })"),
      }),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "An unused common import is not a shared production dependency. Only one sibling references the reader, so neither member has a sharing partner.",
    },
    {
      mode: "types",
      files: familyFixture(
        LIVE_MEMBER("probe", `${SHARED_IMPORT}\nconst proofOnly = readShared(1);`, "() => ({ evaluate: () => 1 })").replace(
          'family: "twin",',
          'family: "twin", mustFlag: [proofOnly],',
        ),
        {
          ...LIBS,
          [siblingPath("twin-sibling")]: LIVE_MEMBER("twin-sibling", SHARED_IMPORT, "() => ({ evaluate: () => readShared(1) })"),
        },
      ),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "A module-level call used only to construct a declared proof must not acquit production hooks that never consume the reader. Cutting the production root boundary makes this pair falsely share.",
    },
    {
      mode: "types",
      files: familyFixture(LIVE_MEMBER("probe", SHARED_IMPORT, "() => ({ evaluate: () => (null as unknown as typeof readShared) })"), {
        ...LIBS,
        [siblingPath("twin-sibling")]: LIVE_MEMBER("twin-sibling", SHARED_IMPORT, "() => ({ evaluate: () => readShared(1) })"),
      }),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "A type query that names the same imported callable is erased from production. Type-only references cannot establish sharing.",
    },
    {
      mode: "types",
      files: familyFixture(LIVE_MEMBER("probe", SHARED_IMPORT, "() => ({ evaluate: () => readShared(1) })"), {
        [SHARED_LIB_PATH]: `${LIB_STUB}\nexport function otherReader(value: unknown): unknown { return value; }\n`,
        [siblingPath("twin-sibling")]: LIVE_MEMBER(
          "twin-sibling",
          'import { otherReader } from "../lib/shared-probe.ts";',
          "() => ({ evaluate: () => otherReader(1) })",
        ),
      }),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "Two unrelated functions in one lib file are different canonical dependencies. Sharing the file alone does not prove that either production hook consumes the other's reader.",
    },
    {
      mode: "types",
      files: familyFixture(LIVE_MEMBER("probe", 'import { readShared } from "../contract/shared-probe.ts";', "() => ({ evaluate: () => readShared(1) })"), {
        "tooling/src/verify/contract/shared-probe.ts": LIB_STUB,
        [siblingPath("twin-sibling")]: LIVE_MEMBER(
          "twin-sibling",
          'import { readShared } from "../contract/shared-probe.ts";',
          "() => ({ evaluate: () => readShared(1) })",
        ),
      }),
      expect: { count: 2, token: FAMILY_FIELD },
      why: "Both production hooks consume the same callable, but it is outside the governed shared-reader home. Cutting the canonical lib home fence would falsely acquit both members.",
    },
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
      why: "The founding pair: only one member consumes a shared reader, so neither has a sharing partner and both are reported. Registering both descriptors through the common defineGate contract is outside their production roots and cannot acquit them.",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("trio", "../lib/other-probe.ts"), {
        ...LIBS,
        [siblingPath("trio-a")]: SIBLING("trio-a", "trio", "../lib/shared-probe.ts"),
        [siblingPath("trio-b")]: SIBLING("trio-b", "trio", "../lib/shared-probe.ts"),
      }),
      expect: { count: 1, token: FAMILY_FIELD },
      why: "Two siblings consume the same canonical reader and the third consumes a different reader. Only the outlier is reported: admitting a single consumer would falsely acquit it, while requiring one dependency common to every family member would falsely accuse the connected pair.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(
        LIVE_MEMBER(
          "probe",
          'import { SUBJECTS } from "../lib/shared-probe.ts"; const names = SUBJECTS.map(subject => subject.name);',
          "() => ({ evaluate: () => names })",
        ),
        {
          [SHARED_LIB_PATH]: 'export const SUBJECTS = [{ name: "one" }, { name: "two" }] as const;\n',
          [siblingPath("twin-sibling")]: LIVE_MEMBER(
            "twin-sibling",
            'import { SUBJECTS as shared } from "../lib/shared-probe.ts";',
            "() => ({ evaluate: () => shared.length })",
          ),
        },
      ),
      why: "A canonical subject vocabulary is a shared production dependency whether consumed directly or through a stable derived value. Requiring function spelling would accuse this admitted data contract; whether its subjects justify the family remains review-owned.",
    },
    {
      mode: "types",
      files: familyFixture(LIVE_MEMBER("probe", 'import { wrapper } from "../lib/wrapper.ts";', "() => ({ evaluate: () => wrapper() })"), {
        [SHARED_LIB_PATH]: LIB_STUB,
        "tooling/src/verify/lib/barrel.ts": 'export { readShared as renamed } from "./shared-probe.ts";\n',
        "tooling/src/verify/lib/wrapper.ts":
          'import * as shared from "./barrel.ts"; export function wrapper() { return second(); } function second() { return shared.renamed(1); }\n',
        [siblingPath("twin-sibling")]: LIVE_MEMBER("twin-sibling", SHARED_IMPORT, "() => ({ evaluate: () => readShared(1) })"),
      }),
      why: "The same canonical reader remains shared through a local wrapper, another helper, a namespace and a re-export rename. The production dependency walk follows resolved edges to a fixpoint without an arbitrary hop limit.",
    },
    {
      mode: "types",
      files: familyFixture(
        LIVE_MEMBER("probe", 'import { subjectFact } from "../lib/shared-probe.ts";', "ctx => ({ evaluate: () => ctx.fact(subjectFact) })"),
        {
          [SHARED_LIB_PATH]: "export const subjectFact = { read: () => 1 };\n",
          [siblingPath("twin-sibling")]: LIVE_MEMBER(
            "twin-sibling",
            'import { subjectFact as fact } from "../lib/shared-probe.ts";',
            "ctx => ({ evaluate: () => ctx.fact(fact) })",
          ),
        },
      ),
      why: "Passing the same canonical fact declaration into production fact reads is consumption even though the declaration itself is data. This rule proves the shared dependency identity; fact validity and declared demand are owned by the runtime contract.",
    },
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
      why: "Both members call the same canonical shared reader from production hooks. The source-reach requirement is mechanical; whether that computation makes the family meaningful and whether the headers explain it remain review obligations.",
    },
    {
      mode: "types",
      files: familyFixture(PROBE("twin", "../../verify/lib/shared-probe.ts"), {
        ...LIBS,
        [siblingPath("twin-sibling")]: SIBLING("twin-sibling", "twin", "../lib/shared-probe.ts"),
      }),
      why: "The same canonical reader is called through two different relative specifiers. A specifier-text key would falsely separate these production dependencies; the census compares their resolved declarations.",
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
