// Canonical Vitest tag vocabulary. Tags carry runner policy, so names and options derive from this one
// registry and strictTags rejects every unregistered spelling.
import type { TestTagDefinition } from "vitest/config";

// Vitest's native `name` reads its augmentable TestTags interface. Our augmentation derives from this
// registry, so retaining that one field would form TestTag -> TEST_TAGS -> TestTagDefinition -> TestTag.
// Project only the circular field to string; every executable tag option remains vendor-owned.
type AuthoredTagDefinition = Omit<TestTagDefinition, "name"> & { readonly name: string };

export const TEST_TAGS = [
  {
    name: "slow",
    description: "A test whose proven runtime needs the existing 30 second timeout.",
    timeout: 30_000,
  },
  {
    name: "requires-process-chdir",
    description: "A test module whose callbacks require process.chdir, which worker threads do not support.",
  },
  {
    name: "source-freshness",
    description: "A source-freshness test that byte-compares generated output with committed files.",
  },
  {
    name: "requires-git-history",
    description: "A test whose callback validates current source against repository history.",
  },
  {
    name: "live",
    description: "A test that calls configured live providers or model engines and may consume credits.",
  },
  {
    name: "local-model-cache",
    description: "A test that runs local-light ONNX models and may download missing weights into the model cache.",
  },
] as const satisfies readonly AuthoredTagDefinition[];

export type TestTag = (typeof TEST_TAGS)[number]["name"];
