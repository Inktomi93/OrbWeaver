// A scoped acquisition selects the worlds whose programs can change an answer about its files.
// Closure invariant: every world whose program contains a singly owned root of a selected world is selected.
// A root shared by several worlds is ambient context each world loads alone; it never pulls its other owners in.
import type { InventoryMembership } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";

interface MembershipIndex {
  readonly containing: ReadonlyMap<string, readonly string[]>;
  readonly roots: ReadonlyMap<string, readonly string[]>;
  readonly rootOwners: ReadonlyMap<string, number>;
}

function indexMembership(membership: readonly InventoryMembership[]): MembershipIndex {
  const containing = new Map<string, string[]>();
  const roots = new Map<string, readonly string[]>();
  const rootOwners = new Map<string, number>();
  for (const partition of membership) {
    if (roots.has(partition.program)) {
      throw new SemanticInventoryError(`native inventory scope membership repeats a program: ${partition.program}`);
    }
    roots.set(partition.program, partition.roots);
    for (const root of partition.roots) {
      rootOwners.set(root, (rootOwners.get(root) ?? 0) + 1);
    }
    for (const file of partition.available) {
      const programs = containing.get(file) ?? [];
      programs.push(partition.program);
      containing.set(file, programs);
    }
  }
  return { containing, roots, rootOwners };
}

/** Select programs from complete native membership; a scope no world contains is an explicit refusal. */
export function scopedInventoryPrograms(membership: readonly InventoryMembership[], files: readonly string[]): ReadonlySet<string> {
  const { containing, roots, rootOwners } = indexMembership(membership);
  const visited = new Set(files);
  const pending = [...visited];
  const selected = new Set<string>();
  const select = (program: string): void => {
    selected.add(program);
    for (const root of roots.get(program) ?? []) {
      if (!visited.has(root) && rootOwners.get(root) === 1) {
        visited.add(root);
        pending.push(root);
      }
    }
  };
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    for (const program of containing.get(file) ?? []) {
      if (!selected.has(program)) {
        select(program);
      }
    }
  }
  if (selected.size === 0) {
    throw new SemanticInventoryError("native inventory scope is contained by no eligible compiler world; no current verdict");
  }
  return selected;
}
