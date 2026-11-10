// The LIST panes: the surfaces a section, a Corpus mode or another definition mounts in its `list` slot, read from
// the slot and never from a file name. The lint rule, the census cohorts and the skeleton cohorts read this one set.
import { posix } from "node:path";
import ts from "typescript";
import type { FileFacts } from "./file-facts.ts";
import { factsOf } from "./file-facts.ts";
import type { Elem } from "./source.ts";
import { loadSources, visit } from "./source.ts";
import { componentsIn } from "./variant-tables.ts";

/** How many component mounts a slot or tree read follows before it stops. */
export const SLOT_HOPS = 3;

/** One component a tree mounts: its file and the elements of that component's own body. */
export interface Rendered {
  readonly facts: FileFacts;
  /** The elements of the one component the element mounts, not of its whole file. */
  readonly elems: readonly Elem[];
}

const COMPONENTS_DOOR = "#components";
const COMPONENTS_DIR = "packages/client/src/components/";
const FEATURE_DIR = "packages/client/src/features/";
const LIST_SLOT = "list";
const composites = new WeakMap<ReadonlyMap<string, FileFacts>, ReadonlyMap<string, FileFacts>>();

/** The file a relative import names; this tree writes the extension in every specifier. */
const importedFile = (path: string, specifier: string): string => posix.normalize(posix.join(posix.dirname(path), specifier));

/** The `#components` composite each name is declared in, read once per file map. */
function compositeFiles(byPath: ReadonlyMap<string, FileFacts>): ReadonlyMap<string, FileFacts> {
  const known = composites.get(byPath);
  if (known !== undefined) {
    return known;
  }
  const byName = new Map<string, FileFacts>();
  for (const [path, facts] of byPath) {
    if (path.startsWith(COMPONENTS_DIR) && facts.source.sf !== null) {
      for (const [name] of componentsIn(facts.source.sf)) {
        byName.set(name, facts);
      }
    }
  }
  composites.set(byPath, byName);
  return byName;
}

/** The elements of one component's body and of the same-file components it renders, never the file's other components. */
function componentTree(facts: FileFacts, root: string): readonly Elem[] {
  // Only the mounted component's own tree: a file can hold the LIST and the CONTENT component side by side.
  const bodies = new Map(facts.source.sf === null ? [] : componentsIn(facts.source.sf));
  const seen = new Set<string>();
  const walk = (name: string): readonly Elem[] => {
    const body = bodies.get(name);
    if (body === undefined || seen.has(name)) {
      return [];
    }
    seen.add(name);
    const own = facts.elems.filter((inner) => inner.opening.pos >= body.pos && inner.opening.end <= body.end);
    return [...own, ...own.flatMap((inner) => walk(inner.tag))];
  };
  return walk(root);
}

/** The client component each element mounts, through a relative import or the `#components` door, with that component's own body. */
export function mounted(facts: FileFacts, elems: readonly Elem[], byPath: ReadonlyMap<string, FileFacts>): readonly Rendered[] {
  return elems.flatMap((elem) => {
    const specifier = facts.relativeImports.get(elem.tag);
    const fromDoor = elem.imported?.source === COMPONENTS_DOOR ? compositeFiles(byPath).get(elem.imported.name) : undefined;
    const target = specifier === undefined ? fromDoor : byPath.get(importedFile(facts.source.path, specifier));
    if (target === undefined) {
      return [];
    }
    return [{ facts: target, elems: componentTree(target, elem.tag) }];
  });
}

/** The `surfaces/` files a component tree reaches from its elements, through anchors and wrappers up to the hop limit. */
function surfacesReached(facts: FileFacts, elems: readonly Elem[], byPath: ReadonlyMap<string, FileFacts>, hops: number): readonly string[] {
  return mounted(facts, elems, byPath).flatMap((next) => {
    if (next.facts.source.path.includes("/surfaces/")) {
      return [next.facts.source.path];
    }
    return hops >= SLOT_HOPS ? [] : surfacesReached(next.facts, next.elems, byPath, hops + 1);
  });
}

/**
 * The repo paths of the surfaces a feature's `lib/` definition mounts in its `list` slot.
 *
 * @remarks
 * The chat transcript, `message-list-surface.tsx`, is no member: it is the room's CONTENT, on the `@orb/ui/message-list`
 * primitive (UI-Architecture-and-Layout.md §0.5, the primitive index, and §4.2, the region map).
 */
export function listSlotSurfaces(all: readonly FileFacts[]): ReadonlySet<string> {
  const client = all.filter((facts) => facts.source.layer === "client");
  const byPath = new Map(client.map((facts) => [facts.source.path, facts]));
  const found = new Set<string>();
  for (const facts of client) {
    const sf = facts.source.sf;
    if (sf === null || !facts.source.path.startsWith(FEATURE_DIR) || !facts.source.path.includes("/lib/")) {
      continue;
    }
    visit(sf, (node) => {
      if (!(ts.isPropertyAssignment(node) && node.name.getText() === LIST_SLOT)) {
        return;
      }
      const inSlot = facts.elems.filter((elem) => elem.opening.pos >= node.initializer.pos && elem.opening.end <= node.initializer.end);
      for (const path of surfacesReached(facts, inSlot, byPath, 0)) {
        found.add(path);
      }
    });
  }
  return found;
}

/** {@link listSlotSurfaces} over the checkout at `root`, for a lint config's `files`. */
export function listSlotSurfacePaths(root: string): readonly string[] {
  return [...listSlotSurfaces(loadSources(root).flatMap((source) => factsOf(source) ?? []))].sort();
}
