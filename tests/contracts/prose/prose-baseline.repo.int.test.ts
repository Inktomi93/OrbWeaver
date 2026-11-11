import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ProseSlotDef } from "@orb/contracts/prose";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

// `prose-baseline.json` is the committed version and text-hash record of every prose slot. A host's stored
// `baseVersion` only means "the default moved on" while a text edit cannot ship without its version bump.
const manifestSchema = z.object({ slots: z.record(z.string(), z.object({ version: z.int().positive(), sha256: z.string() })) });
type Manifest = z.infer<typeof manifestSchema>["slots"];
type Registry = Readonly<Record<string, Pick<ProseSlotDef, "text" | "version">>>;

type Finding =
  | { readonly id: string; readonly kind: "unbumped" }
  | { readonly id: string; readonly kind: "refresh-manifest"; readonly row: { readonly version: number; readonly sha256: string } }
  | { readonly id: string; readonly kind: "unlisted" | "unregistered" };

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

async function readManifest(): Promise<Manifest> {
  const raw = await readFile(new URL("../../../packages/contracts/src/prose/prose-baseline.json", import.meta.url), "utf8");
  return manifestSchema.parse(JSON.parse(raw)).slots;
}

function findings(manifest: Manifest, registry: Registry): Finding[] {
  const out: Finding[] = [];
  for (const [id, slot] of Object.entries(registry)) {
    const prior = manifest[id];
    if (prior === undefined) {
      out.push({ id, kind: "unlisted" });
      continue;
    }
    const hash = sha256(slot.text);
    if (prior.sha256 !== hash && prior.version >= slot.version) {
      out.push({ id, kind: "unbumped" });
    } else if (prior.sha256 !== hash || prior.version !== slot.version) {
      // A bump that the manifest has not recorded would let the next unbumped edit compare against a stale row.
      out.push({ id, kind: "refresh-manifest", row: { version: slot.version, sha256: hash } });
    }
  }
  for (const id of Object.keys(manifest)) {
    if (!(id in registry)) {
      out.push({ id, kind: "unregistered" });
    }
  }
  return out;
}

test("the committed prose baseline records every registry slot at its current text and version", async () => {
  expect(findings(await readManifest(), PROSE_SLOTS)).toEqual([]);
});

// The controls run over one production slot and a manifest row cut from it, so a violation elsewhere in the tree
// cannot disturb them.
function oneRealSlot(): { readonly id: string; readonly slot: Registry[string]; readonly manifest: Manifest } {
  const [id, slot] = Object.entries(PROSE_SLOTS)[0] ?? [];
  if (id === undefined || slot === undefined) {
    throw new Error("The prose registry holds no slot");
  }
  return { id, slot, manifest: { [id]: { version: slot.version, sha256: sha256(slot.text) } } };
}

test("a text edit without a version bump is refused, and a bump must be recorded", () => {
  const { id, slot, manifest } = oneRealSlot();
  const edited = `${slot.text} edited`;

  expect(findings(manifest, { [id]: slot })).toEqual([]);
  expect(findings(manifest, { [id]: { text: edited, version: slot.version } })).toEqual([{ id, kind: "unbumped" }]);
  expect(findings(manifest, { [id]: { text: edited, version: slot.version + 1 } })).toEqual([
    { id, kind: "refresh-manifest", row: { version: slot.version + 1, sha256: sha256(edited) } },
  ]);
});

test("a slot missing from either side of the baseline is refused", () => {
  const { id, slot, manifest } = oneRealSlot();

  expect(findings(manifest, { [id]: slot })).toEqual([]);
  expect(findings({}, { [id]: slot })).toEqual([{ id, kind: "unlisted" }]);
  expect(findings(manifest, {})).toEqual([{ id, kind: "unregistered" }]);
});
