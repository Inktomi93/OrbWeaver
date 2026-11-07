// The checker takes one concrete program: the root tsconfig is a solution file that compiles nothing.
import { UsageError } from "../../floor/cli/run-tool.ts";

/** The one world holding every named file, from each world's home files. */
export function worldOf(files: readonly string[], homes: ReadonlyMap<string, ReadonlySet<string>>): string {
  const worldOfFile = (file: string): string | undefined => [...homes].find(([, held]) => held.has(file))?.[0];
  const orphans = files.filter((file) => worldOfFile(file) === undefined);
  if (orphans.length > 0) {
    throw new UsageError(`no compiler world holds ${orphans.join(", ")}`);
  }
  const worlds = [...new Set(files.flatMap((file) => worldOfFile(file) ?? []))];
  const [world, ...others] = worlds;
  if (world === undefined || others.length > 0) {
    throw new UsageError(`one compiler world per run: these files span ${worlds.join(" and ")}`);
  }
  return world;
}
