// Reads rows through packages/p/src/domain/d/substrate/io.ts, as ../substrate/io.ts states.
import { loop } from "#domain/d/engine";
import { kit } from "#domain/k";
import { loadDecided } from "#src/domain/d/substrate/io.ts";
import { pure } from "#src/domain/d/substrate/pure.ts";
import { readFile } from "node:fs";

// packages/p/src/domain/d/substrate/io.tsx is another file and stays; see packages/p/src/domain/d/substrate/io.ts.
// The quoted example "packages/p/src/domain/d/substrate/io.ts" and '../substrate/io.ts' stay.
export const run = [loop, kit, loadDecided, pure, readFile, "#src/domain/d/substrate/io.ts"];
