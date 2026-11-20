import type { loadDecided as LoadDecided } from "../substrate/io.ts";
import { loadDecided } from '../substrate/io.ts';
import { pureRule } from "../substrate/pure.ts";
import { tick } from "#src/domain/d/substrate/loop.ts";
import { other } from "#src/domain/d/substrate/pure.ts";
export { loadDecided as read } from "../substrate/io.ts";

const label = "../substrate/io.ts";

export async function readLazily(id: string): ReturnType<typeof LoadDecided> {
  const lazy = await import("../substrate/io.ts");
  tick(label);
  other(pureRule);
  return lazy.loadDecided(id);
}
