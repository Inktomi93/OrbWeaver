import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SHELL_SOURCES = "packages/client/src/features/app-shell/**/*.tsx";
const PRIMITIVE_SOURCES = "packages/ui/src/**/*.tsx";
const SLOT_ATTRIBUTE = /data-slot="([a-z0-9-]+)"/gu;

function slotsDeclaredIn(root: string, pattern: string): Set<string> {
  const slots = new Set<string>();
  for (const file of globSync(pattern, { cwd: root })) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(SLOT_ATTRIBUTE)) {
      const [, slot] = match;
      if (slot !== undefined) {
        slots.add(slot);
      }
    }
  }
  return slots;
}

/** The `data-slot` values the app shell feature renders itself; a slot a primitive also renders belongs to the primitive. */
export function shellOwnedSlots(root: string): ReadonlySet<string> {
  const primitives = slotsDeclaredIn(root, PRIMITIVE_SOURCES);
  return new Set([...slotsDeclaredIn(root, SHELL_SOURCES)].filter((slot) => !primitives.has(slot)));
}
