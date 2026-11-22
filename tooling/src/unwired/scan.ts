// The member scan: one pass of engine one, each world's program built once, judges every callable member; a test-only
// use makes a member test-only. Engine two's find-references adds no use engine one lacks (every fixture in
// tests/tooling/unwired/scan.int.test.ts and the real tree agree), so it runs only as the `--cross-check` audit, through
// the TypeScript 6 language service, and a member it finds used is a disagreement.

import { TEST_WORLDS } from "../floor/testing/test-worlds.ts";
import type { ReferenceKind, Site } from "./classify.ts";
import { classifyReference, Sources, siteKey } from "./classify.ts";
import type { DeliberateEntry } from "./deliberate.ts";
import { deliberateEntry } from "./deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "./judged.ts";
import { sortJudged } from "./judged.ts";
import { serviceReferences } from "./language-service.ts";
import { homeFiles, NativeWorld } from "./native.ts";
import type { PropertyFacts, ReferenceIndex } from "./occurrences.ts";
import { joinFacts, propertyFacts, propertyIndex } from "./occurrences.ts";
import type { DetachedMember, TypeMember } from "./type-members.ts";
import { detached, typeMembers } from "./type-members.ts";
import { packageWorlds } from "./worlds.ts";

const UNWIRED_KINDS = ["builder-only", "test-only", "unreferenced"] as const;
/** `builder-only`: something supplies it and nothing calls it. `test-only`: only tests call it. */
type UnwiredKind = (typeof UNWIRED_KINDS)[number];

interface UnwiredMember {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly kind: UnwiredKind;
  readonly tests: number;
}

export interface UnwiredReport {
  readonly worlds: readonly { readonly config: string; readonly members: number }[];
  readonly scanned: number;
  readonly unwired: readonly UnwiredMember[];
  readonly deliberate: readonly (UnwiredMember & { readonly reason: string })[];
  readonly judged: JudgedSplit<UnwiredMember>["judged"];
  readonly staleJudged: JudgedSplit<UnwiredMember>["staleJudged"];
  /** Under `--cross-check`, members engine one found unused and the audit found used: a resolution gap to fix. */
  readonly disagreements: readonly { readonly key: string; readonly uses: readonly string[] }[];
}

/** The options every scan takes: the root, its worlds, the deliberate and judged lists and a progress log. */
export interface ScanOptions {
  readonly root: string;
  readonly worlds?: readonly string[];
  readonly testWorlds?: readonly string[];
  readonly deliberate: readonly DeliberateEntry[];
  /** The rows a board item owns, for this scan's report. */
  readonly judged?: readonly JudgedEntry[];
  readonly log: (line: string) => void;
  /** Engine two asks the TypeScript 6 language service instead of TypeScript 7.1, as an audit of engine one. */
  readonly crossCheck?: boolean;
}

/** One callable member and what engine one found pointing at it across one world. */
export interface MemberReferences {
  readonly key: string;
  readonly member: DetachedMember;
  readonly counts: Readonly<Record<ReferenceKind, number>>;
  /** Each reference with its kind, so a site both engines report counts once. */
  readonly sites: readonly (Site & { readonly kind: ReferenceKind })[];
}

const emptyCounts = (): Record<ReferenceKind, number> => ({ use: 0, builder: 0, plumbing: 0, test: 0, external: 0 });

/** The sites an index holds for a declaration's keys, its own name excluded. */
export function sitesOf(index: ReferenceIndex, keys: readonly string[], own: Site): readonly Site[] {
  const seen = new Map<string, Site>();
  for (const site of keys.flatMap((key) => index.get(key) ?? [])) {
    seen.set(siteKey(site), site);
  }
  seen.delete(siteKey(own));
  return [...seen.values()];
}

function classifySites(sources: Sources, sites: readonly Site[]): readonly (Site & { readonly kind: ReferenceKind })[] {
  return sites.map((site) => ({ ...site, kind: classifyReference(sources.get(site.file), site.position, site.file) }));
}

function countKinds(sites: readonly { readonly kind: ReferenceKind }[]): Record<ReferenceKind, number> {
  const counts = emptyCounts();
  for (const site of sites) {
    counts[site.kind]++;
  }
  return counts;
}

/** Every callable member of one world with engine one's classified references. */
export function scanWorld(world: NativeWorld, sources: Sources): readonly MemberReferences[] {
  return memberReferences(callableMembers(world), propertyIndex(world), sources);
}

const callableMembers = (world: NativeWorld): readonly TypeMember[] => typeMembers(world).filter((member) => member.callable && !member.nested);

function memberReferences(members: readonly DetachedMember[], index: ReferenceIndex, sources: Sources): readonly MemberReferences[] {
  return members.map((member) => {
    const sites = classifySites(sources, sitesOf(index, member.keys, member.site));
    return { key: `${member.site.file}:${member.home}.${member.member}`, member, counts: countKinds(sites), sites };
  });
}

/** The package worlds and the test worlds a scan runs over, defaulted from the root. */
export function scanWorlds(options: ScanOptions): { readonly worlds: readonly string[]; readonly testWorlds: readonly string[] } {
  return { worlds: options.worlds ?? packageWorlds(options.root), testWorlds: options.testWorlds ?? TEST_WORLDS };
}

/** A file, home and member the deliberate list is asked about. */
export interface DeliberateSide {
  readonly file: string;
  readonly home: string;
  readonly member: string;
}

/** Split findings into the unwired and the ones the deliberate list excuses, each of those with its reason. A finding
 *  that stands for several declarations, as a restated pair does, names each through `sides`; any excused side
 *  excuses it. */
export function sortDeliberate<Finding extends DeliberateSide>(
  findings: readonly Finding[],
  entries: readonly DeliberateEntry[],
  sides: (finding: Finding) => readonly DeliberateSide[] = (finding) => [finding],
): { readonly unwired: readonly Finding[]; readonly deliberate: readonly (Finding & { readonly reason: string })[] } {
  const unwired: Finding[] = [];
  const deliberate: (Finding & { readonly reason: string })[] = [];
  for (const finding of findings) {
    const reason = sides(finding)
      .map((side) => deliberateEntry(entries, side.file, side.home, side.member)?.reason)
      .find((found) => found !== undefined);
    if (reason === undefined) {
      unwired.push(finding);
    } else {
      deliberate.push({ ...finding, reason });
    }
  }
  return { unwired, deliberate };
}

/** {@link sortDeliberate}, then the judged list over what it leaves: every bucket a report without rulings of its own
 *  writes. */
export function sortRows<Finding extends DeliberateSide & { readonly key: string }>(
  findings: readonly Finding[],
  options: Pick<ScanOptions, "root" | "deliberate" | "judged">,
): JudgedSplit<Finding> & { readonly deliberate: readonly (Finding & { readonly reason: string })[] } {
  const { unwired, deliberate } = sortDeliberate(findings, options.deliberate);
  return { ...sortJudged(unwired, options), deliberate };
}

interface Tally {
  readonly first: MemberReferences;
  use: number;
  builder: number;
  /** Test references by site, and production uses only a test world resolves. */
  readonly tests: Map<string, Site>;
}

// A file homed in a test world is reached only from tests, so a use there is test-only.
function tallyMembers(tally: Map<string, Tally>, members: readonly MemberReferences[], testFiles: ReadonlySet<string>): void {
  for (const member of members) {
    const entry = tally.get(member.key) ?? { first: member, use: 0, builder: 0, tests: new Map<string, Site>() };
    entry.builder += member.counts.builder;
    for (const site of member.sites) {
      const testOnly = testFiles.has(site.file);
      entry.use += site.kind === "use" && !testOnly ? 1 : 0;
      if (site.kind === "test" || (site.kind === "use" && testOnly)) {
        entry.tests.set(siteKey(site), site);
      }
    }
    tally.set(member.key, entry);
  }
}

function kindOf(tests: number, builders: number): UnwiredKind {
  if (tests > 0) {
    return "test-only";
  }
  return builders > 0 ? "builder-only" : "unreferenced";
}

/** Run engine one over the worlds of `root`, and the `--cross-check` audit when asked. */
export function scanUnwired(options: ScanOptions): UnwiredReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  const counted: UnwiredReport["worlds"][number][] = [];
  const configs = [...worlds, ...testWorlds];
  const lists = NativeWorld.fileLists(options.root, configs);
  const homes = homeFiles(configs, lists);
  const facts: PropertyFacts[] = [];
  const declared = new Map<string, DetachedMember>();
  for (const config of configs) {
    using world = NativeWorld.open(options.root, config);
    const members = callableMembers(world);
    for (const member of members) {
      declared.set(siteKey(member.site), declared.get(siteKey(member.site)) ?? detached(member));
    }
    facts.push(propertyFacts(world, homes.get(config)));
    counted.push({ config, members: members.length });
    options.log(`${config}: ${members.length} members`);
  }
  const testFiles = new Set(testWorlds.flatMap((config) => [...(homes.get(config) ?? [])]));
  tallyMembers(tally, memberReferences([...declared.values()], joinFacts(facts).index, sources), testFiles);
  const candidates = [...tally.values()].filter((entry) => entry.use === 0);
  const audited =
    options.crossCheck === true
      ? serviceReferences(
          options.root,
          configs,
          candidates.map((entry) => entry.first.member.site),
          { log: options.log, crossCheck: true, lists },
        )
      : new Map<string, readonly Site[]>();
  const findings: UnwiredMember[] = [];
  const disagreements: UnwiredReport["disagreements"][number][] = [];
  for (const entry of candidates) {
    const { site, line, home, member } = entry.first.member;
    const references = classifySites(sources, audited.get(siteKey(site)) ?? []);
    const uses = references.filter((reference) => reference.kind === "use");
    if (uses.length > 0) {
      disagreements.push({ key: entry.first.key, uses: uses.map((reference) => `${reference.file}:${sources.line(reference)}`) });
      continue;
    }
    for (const reference of references.filter((candidate) => candidate.kind === "test")) {
      entry.tests.set(siteKey(reference), reference);
    }
    const tests = entry.tests.size;
    findings.push({ key: entry.first.key, file: site.file, line, home, member, kind: kindOf(tests, entry.builder), tests });
  }
  return { worlds: counted, scanned: tally.size, ...sortRows(findings, options), disagreements };
}
