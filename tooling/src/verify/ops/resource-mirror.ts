// Mirror-index acquisition. Derived from the invocation's own authored-tree facts, never a second walk.
//
// THE REFUSAL IS THE CAPABILITY. Each of the three consuming policies today answers "is there a mirror" with
// `existsSync`, which cannot distinguish "the test tree has no member here" from "the test tree is not
// there at all" — and the second reads as a clean corpus. An absent or unreadable space propagates the
// tree's own status verbatim; it never becomes an empty index.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader, ResourceTreeEntry } from "../contract/resource.ts";
import type { MirrorFamilyId, MirrorIndex } from "../contract/resource-mirror.ts";
import { MIRROR_FAMILY_DEFINITIONS } from "../contract/resource-mirror.ts";
import { loadAuthoredTree } from "./resource-tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function withinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function sortedSet(paths: readonly string[]): ReadonlySet<string> {
  return new Set(paths.toSorted((left, right) => left.localeCompare(right)));
}

function directoryOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function groupByDirectory(paths: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const path of paths.toSorted((left, right) => left.localeCompare(right))) {
    const directory = directoryOf(path);
    const members = groups.get(directory);
    if (members === undefined) {
      groups.set(directory, [path]);
    } else {
      members.push(path);
    }
  }
  return new Map(
    [...groups].toSorted(([left], [right]) => left.localeCompare(right)).map(([directory, members]) => [directory, Object.freeze(members)] as const),
  );
}

function membersWithin(entries: readonly ResourceTreeEntry[], root: string, kind: ResourceTreeEntry["kind"]): readonly string[] {
  return entries.filter((entry) => entry.kind === kind && withinRoot(entry.path, root)).map((entry) => entry.path);
}

export function loadMirrorIndex(reader: ResourceReader, family: MirrorFamilyId): ResourceLoad<MirrorIndex> {
  if (!Object.hasOwn(MIRROR_FAMILY_DEFINITIONS, family)) {
    return { status: "unresolved", paths: [], members: 0, reason: `unknown mirror family: ${String(family)}` };
  }
  const definition = MIRROR_FAMILY_DEFINITIONS[family];
  const sources = loadAuthoredTree(reader, definition.sourceTree);
  if (sources.status !== "ready") {
    return {
      status: sources.status,
      paths: sources.paths,
      members: 0,
      reason: `mirror family ${family} source space ${definition.sourceRoot}: ${sources.reason}`,
    };
  }
  const tests = loadAuthoredTree(reader, definition.testTree);
  if (tests.status !== "ready") {
    return { status: tests.status, paths: tests.paths, members: 0, reason: `mirror family ${family} test space ${definition.testRoot}: ${tests.reason}` };
  }
  const sourceFiles = membersWithin(sources.value, definition.sourceRoot, "file");
  const sourceDirectories = membersWithin(sources.value, definition.sourceRoot, "directory");
  const testFiles = membersWithin(tests.value, definition.testRoot, "file");
  // A family whose bounded space has no file at all is a REFUSAL, not an empty index: it is the exact shape
  // of a mirror question asked against a tree that is not there, and every answer derived from it would be
  // "no mirror" for reasons that have nothing to do with the corpus.
  if (sourceFiles.length === 0 || testFiles.length === 0) {
    return {
      status: "empty",
      paths: [],
      members: 0,
      reason: `mirror family ${family} has an empty space: ${definition.sourceRoot}=${String(sourceFiles.length)} files, ${definition.testRoot}=${String(testFiles.length)} files`,
    };
  }
  const value: MirrorIndex = {
    family,
    sourceRoot: definition.sourceRoot,
    testRoot: definition.testRoot,
    sourceFiles: sortedSet(sourceFiles),
    sourceDirectories: sortedSet(sourceDirectories),
    testFiles: sortedSet(testFiles),
    testsByDirectory: groupByDirectory(testFiles),
  };
  // `members` is what the door MEASURED — every file in both spaces — never the mirrors it happened to find.
  const paths = [...sourceFiles, ...testFiles].toSorted((left, right) => left.localeCompare(right));
  return { status: "ready", value, paths, members: paths.length };
}
