// The unwired scan: engine one over every world, then engine two over the members engine one found unused. A member
// is unwired only when neither engine finds a production use. A use in a test world alone makes it test-only.
import { join, relative } from "node:path";
import type { DeliberateEntry } from "./deliberate.ts";
import { deliberateEntry } from "./deliberate.ts";
import type { ServerReferences } from "./language-server.ts";
import { serverReferences } from "./language-server.ts";
import type { MemberReferences } from "./language-service.ts";
import { scanWorld } from "./language-service.ts";
import { isProduction, loadWorld, packageWorlds, TEST_WORLDS } from "./worlds.ts";

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

export interface ScanOptions {
  readonly root: string;
  readonly worlds?: readonly string[];
  readonly testWorlds?: readonly string[];
  readonly deliberate: readonly DeliberateEntry[];
  /** The TypeScript 7 `tsc` that serves `--lsp`; the root's own by default. */
  readonly serverBin?: string;
  readonly log: (line: string) => void;
}

interface Tally {
  readonly first: MemberReferences;
  use: number;
  builder: number;
  test: number;
}

function tallyWorld(tally: Map<string, Tally>, members: readonly MemberReferences[], testWorld: boolean): void {
  for (const member of members) {
    const entry = tally.get(member.key) ?? { first: member, use: 0, builder: 0, test: 0 };
    // A test world's production files are the same files the package worlds already counted.
    entry.use += testWorld ? 0 : member.counts.use;
    entry.test += member.counts.test + (testWorld ? member.counts.use : 0);
    entry.builder += member.counts.builder;
    tally.set(member.key, entry);
  }
}

// One production file of a world, opened so the language server loads that world's project.
function primeFile(root: string, config: string): readonly string[] {
  const file = loadWorld(root, config)
    .fileNames.map((name) => relative(root, name))
    .find(isProduction);
  return file === undefined ? [] : [file];
}

function kindOf(tests: number, builders: number): UnwiredKind {
  if (tests > 0) {
    return "test-only";
  }
  return builders > 0 ? "builder-only" : "unreferenced";
}

function judge(
  entry: Tally,
  server: ServerReferences | undefined,
  entries: readonly DeliberateEntry[],
): { readonly found: UnwiredMember; readonly reason: string | null } {
  const { key, file, line, home, member } = entry.first;
  const tests = entry.test + (server?.counts.test ?? 0);
  return {
    found: { key, file, line, home, member, kind: kindOf(tests, entry.builder), tests },
    reason: deliberateEntry(entries, file, home, member)?.reason ?? null,
  };
}

/** Run both engines over the worlds of `root`. */
export async function scanUnwired(options: ScanOptions): Promise<UnwiredReport> {
  const worlds = options.worlds ?? packageWorlds(options.root);
  const testWorlds = options.testWorlds ?? TEST_WORLDS;
  const tally = new Map<string, Tally>();
  const counted: UnwiredReport["worlds"][number][] = [];
  const runs = [...worlds.map((world) => [world, false] as const), ...testWorlds.map((world) => [world, true] as const)];
  for (const [config, testWorld] of runs) {
    const members = scanWorld(options.root, config);
    tallyWorld(tally, members, testWorld);
    counted.push({ config, members: members.length });
    options.log(`${config}: ${members.length} members`);
  }
  const candidates = [...tally.values()].filter((entry) => entry.use === 0);
  const second = await serverReferences(
    options.root,
    options.serverBin ?? join(options.root, "node_modules/.bin/tsc"),
    candidates.map((entry) => entry.first),
    [...worlds, ...testWorlds].flatMap((config) => primeFile(options.root, config)),
  );
  const serverUse = new Map(second.map((found) => [found.key, found]));
  const unwired: UnwiredMember[] = [];
  const deliberate: (UnwiredMember & { readonly reason: string })[] = [];
  const disagreements: UnwiredReport["disagreements"][number][] = [];
  for (const entry of candidates) {
    const server = serverUse.get(entry.first.key);
    if (server !== undefined && server.counts.use > 0) {
      disagreements.push({ key: entry.first.key, uses: server.uses });
      continue;
    }
    const { found, reason } = judge(entry, server, options.deliberate);
    if (reason === null) {
      unwired.push(found);
    } else {
      deliberate.push({ ...found, reason });
    }
  }
  return { worlds: counted, scanned: tally.size, unwired, deliberate, disagreements };
}
