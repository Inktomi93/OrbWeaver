// The member scan: engine one indexes every world, then engine two asks find-references about the members engine one
// found unused. A member is unwired only when neither engine finds a production use; a test-only use makes it test-only.
import type { ReferenceKind, Site } from "./classify.ts";
import { classifyReference, Sources, siteKey } from "./classify.ts";
import type { DeliberateEntry } from "./deliberate.ts";
import { deliberateEntry } from "./deliberate.ts";
import { serviceReferences } from "./language-service.ts";
import { NativeWorld } from "./native.ts";
import type { ReferenceIndex } from "./occurrences.ts";
import { propertyIndex } from "./occurrences.ts";
import type { TypeMember } from "./type-members.ts";
import { typeMembers } from "./type-members.ts";
import { packageWorlds, TEST_WORLDS } from "./worlds.ts";

export const UNWIRED_KINDS = ["builder-only", "test-only", "unreferenced"] as const;
/** `builder-only`: something supplies it and nothing calls it. `test-only`: only tests call it. */
export type UnwiredKind = (typeof UNWIRED_KINDS)[number];

export interface UnwiredMember {
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
  /** Members engine one found unused and engine two found used: reported so a resolution gap stays visible. */
  readonly disagreements: readonly { readonly key: string; readonly uses: readonly string[] }[];
}

/** The options every scan takes: the root, its worlds, the deliberate list and a progress log. */
export interface ScanOptions {
  readonly root: string;
  readonly worlds?: readonly string[];
  readonly testWorlds?: readonly string[];
  readonly deliberate: readonly DeliberateEntry[];
  readonly log: (line: string) => void;
}

/** One callable member and what engine one found pointing at it across one world. */
export interface MemberReferences {
  readonly key: string;
  readonly member: TypeMember;
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
  const members = typeMembers(world).filter((member) => member.callable && !member.nested);
  const index = propertyIndex(world);
  return members.map((member) => {
    const sites = classifySites(sources, sitesOf(index, member.keys, member.site));
    return { key: `${member.site.file}:${member.home}.${member.member}`, member, counts: countKinds(sites), sites };
  });
}

/** The package worlds and the test worlds a scan runs over, defaulted from the root. */
export function scanWorlds(options: ScanOptions): { readonly worlds: readonly string[]; readonly testWorlds: readonly string[] } {
  return { worlds: options.worlds ?? packageWorlds(options.root), testWorlds: options.testWorlds ?? TEST_WORLDS };
}

/** Split findings into the unwired and the ones the deliberate list excuses, each of those with its reason. */
export function sortDeliberate<Finding extends { readonly file: string; readonly home: string; readonly member: string }>(
  findings: readonly Finding[],
  entries: readonly DeliberateEntry[],
): { readonly unwired: readonly Finding[]; readonly deliberate: readonly (Finding & { readonly reason: string })[] } {
  const unwired: Finding[] = [];
  const deliberate: (Finding & { readonly reason: string })[] = [];
  for (const finding of findings) {
    const reason = deliberateEntry(entries, finding.file, finding.home, finding.member)?.reason;
    if (reason === undefined) {
      unwired.push(finding);
    } else {
      deliberate.push({ ...finding, reason });
    }
  }
  return { unwired, deliberate };
}

interface Tally {
  readonly first: MemberReferences;
  use: number;
  builder: number;
  /** Test references by site, and production uses only a test world resolves. */
  readonly tests: Map<string, Site>;
}

function tallyWorld(tally: Map<string, Tally>, members: readonly MemberReferences[], testWorld: boolean): void {
  for (const member of members) {
    const entry = tally.get(member.key) ?? { first: member, use: 0, builder: 0, tests: new Map<string, Site>() };
    // A test world's production files are the same files the package worlds already counted.
    entry.use += testWorld ? 0 : member.counts.use;
    entry.builder += member.counts.builder;
    for (const site of member.sites.filter((reference) => reference.kind === "test" || (testWorld && reference.kind === "use"))) {
      entry.tests.set(siteKey(site), site);
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

/** Run both engines over the worlds of `root`. */
export function scanUnwired(options: ScanOptions): UnwiredReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = new Map<string, Tally>();
  const counted: UnwiredReport["worlds"][number][] = [];
  const runs = [...worlds.map((world) => [world, false] as const), ...testWorlds.map((world) => [world, true] as const)];
  for (const [config, testWorld] of runs) {
    using world = NativeWorld.open(options.root, config);
    const members = scanWorld(world, sources);
    tallyWorld(tally, members, testWorld);
    counted.push({ config, members: members.length });
    options.log(`${config}: ${members.length} members`);
  }
  const candidates = [...tally.values()].filter((entry) => entry.use === 0);
  const second = serviceReferences(
    options.root,
    [...worlds, ...testWorlds],
    candidates.map((entry) => entry.first.member.site),
    options.log,
  );
  const findings: UnwiredMember[] = [];
  const disagreements: UnwiredReport["disagreements"][number][] = [];
  for (const entry of candidates) {
    const { site, line, home, member } = entry.first.member;
    const references = classifySites(sources, second.get(siteKey(site)) ?? []);
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
  return { worlds: counted, scanned: tally.size, ...sortDeliberate(findings, options.deliberate), disagreements };
}
