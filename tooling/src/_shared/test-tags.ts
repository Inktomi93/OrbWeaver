// Canonical Vitest tag vocabulary. Tags carry runner policy, so names and options derive from this one
// registry and strictTags rejects every unregistered spelling.
import type { TestOptions } from "vitest";

type VitestTagDefinition = Omit<TestOptions, "tags" | "shuffle"> & {
  readonly name: string;
  readonly description?: string;
  readonly priority?: number;
};

export const TEST_TAGS = [
  {
    name: "slow",
    description: "A test whose proven runtime needs the existing 30 second timeout.",
    timeout: 30_000,
  },
] as const satisfies readonly VitestTagDefinition[];

export type TestTag = (typeof TEST_TAGS)[number]["name"];
