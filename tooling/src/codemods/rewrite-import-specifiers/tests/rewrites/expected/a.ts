import { readCorpus } from "@orb/testkit/node/corpus.ts";
import type { Helper } from "./helpers/index.ts";
import { keep } from "@orb/testkit/node/corpus.ts";
export { again } from "./helpers/index.ts";

export async function load(): Promise<Helper> {
  const lazy = await import("./helpers/index.ts");
  return lazy.make(readCorpus, keep);
}
