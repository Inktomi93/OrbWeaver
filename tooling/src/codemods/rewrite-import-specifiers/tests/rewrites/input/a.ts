import { readCorpus } from "@orb/testkit/node/corpus-read.ts";
import type { Helper } from "./old-helper.ts";
import { keep } from "@orb/testkit/node/corpus.ts";
export { again } from "./old-helper.ts";

export async function load(): Promise<Helper> {
  const lazy = await import("./old-helper.ts");
  return lazy.make(readCorpus, keep);
}
