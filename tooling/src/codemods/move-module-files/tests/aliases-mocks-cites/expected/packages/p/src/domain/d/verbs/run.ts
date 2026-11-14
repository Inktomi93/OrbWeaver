// Reads rows through packages/p/src/domain/d/persistence/io.ts, as ../persistence/io.ts states.
import { loop } from "#domain/d/runner";
import { kit } from "#domain/k";
import { loadDecided } from "#src/domain/d/persistence/io.ts";
import { pure } from "#src/domain/d/substrate/pure.ts";
import { readFile } from "node:fs";

// packages/p/src/domain/d/substrate/io.tsx is another file and stays; see packages/p/src/domain/d/persistence/io.ts.
// The quoted example "packages/p/src/domain/d/substrate/io.ts" and '../substrate/io.ts' stay.
export const run = [loop, kit, loadDecided, pure, readFile, "#src/domain/d/substrate/io.ts"];
