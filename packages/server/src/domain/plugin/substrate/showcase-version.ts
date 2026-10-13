// One projection of the shipped manifest serves updates and seeding.
import type { ReadShowcaseVersionSource, ShowcaseVersionReader } from "../contract/seed-ops.ts";

export function createShowcaseVersionReader(read: ReadShowcaseVersionSource): ShowcaseVersionReader {
  return async (slug): Promise<string | null> => (await read(slug))?.version ?? null;
}
