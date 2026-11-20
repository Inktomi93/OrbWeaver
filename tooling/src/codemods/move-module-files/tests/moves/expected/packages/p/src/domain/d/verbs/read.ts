import type { loadDecided as LoadDecided } from "../persistence/io.ts";
import { loadDecided } from '../persistence/io.ts';
import { pureRule } from "../substrate/pure.ts";
import { tick } from "#src/domain/d/engine/loop.ts";
import { other } from "#src/domain/d/substrate/pure.ts";
export { loadDecided as read } from "../persistence/io.ts";

const label = "../substrate/io.ts";

export async function readLazily(id: string): ReturnType<typeof LoadDecided> {
  const lazy = await import("../persistence/io.ts");
  tick(label);
  other(pureRule);
  return lazy.loadDecided(id);
}
