// THE CORPUS READER FOR THE CLASS-MERGE TRACE (#2460). `tests/ui/lib/class-merge.test.ts` pins the
// merger's ANSWERS pair by pair; this file pins the one thing a pair-by-pair suite structurally cannot:
// that NOTHING in `@orb/ui`'s own shipped class lists is being evicted across Tailwind class groups.
//
// WHY IT EXISTS. #2450 shipped because `text-field` was never registered as a type-scale utility, so
// tailwind-merge read it as a second text COLOR and dropped it beside `text-foreground` — Combobox and
// Autocomplete painted no field step and re-armed the iOS focus zoom. Every instrument that could have
// caught it stayed green: the trace filed the eviction as an ordinary conflict (it HAD a replayable
// winner), and nothing read the trace by default — `snap --cascade` is opt-in per session. A browser is
// not needed to find that class of defect, and a defect only a live driver can see is a defect nobody
// sees. This runs the whole shipped corpus through `cn` with the trace enabled, in node, every suite run.
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cn, cssMergeTrace, tv } from "@orb/ui/lib";
import { expect, test } from "../../support/fixtures.ts";

const UI_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/ui/src");

/** Every `variants.ts` under `packages/ui/src` — DERIVED by walking the tree, never a hand-listed roster:
 *  a primitive added tomorrow is covered by existing, which is the whole point of a corpus pin. */
function variantModules(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...variantModules(path));
    } else if (entry.name === "variants.ts") {
      found.push(path);
    }
  }
  return found.sort((left, right) => left.localeCompare(right));
}

type SlotRender = (...args: unknown[]) => string;
type VariantFactory = ((props?: Record<string, unknown>) => string | Record<string, SlotRender>) & {
  readonly variants?: Record<string, Record<string, unknown>>;
  readonly compoundVariants?: readonly Record<string, unknown>[];
};

function isVariantFactory(value: unknown): value is VariantFactory {
  return typeof value === "function" && "variantKeys" in value;
}

/** One selection through the factory, plus every slot it returns. The RESULT is discarded — the receipt
 *  the trace accumulated during the call is what this file reads. */
function exerciseSelection(factory: VariantFactory, props: Record<string, unknown>): void {
  const result = factory(props);
  if (typeof result !== "string") {
    for (const render of Object.values(result)) {
      render();
    }
  }
}

/** Per-axis, not the cartesian product: every class list a recipe can emit appears in at least one
 *  single-axis selection or in its own compound row, and the eviction being hunted happens between a
 *  recipe's base and ONE arm. A full product would be exponential and would add no class list. */
function exerciseFactory(factory: VariantFactory): void {
  exerciseSelection(factory, {});
  for (const [axis, arms] of Object.entries(factory.variants ?? {})) {
    for (const arm of Object.keys(arms)) {
      exerciseSelection(factory, { [axis]: arm });
    }
  }
  for (const compound of factory.compoundVariants ?? []) {
    const { class: _class, className: _className, ...selection } = compound;
    exerciseSelection(factory, selection);
  }
}

function exercise(value: unknown, depth: number): void {
  if (typeof value === "string") {
    cn(value);
    return;
  }
  if (isVariantFactory(value)) {
    exerciseFactory(value);
    return;
  }
  // A plain object or array of class strings (`OVERLAY_MOTION`, the shared recipe constants) is a class
  // list too — the merger sees it the moment a caller spreads it into `cn`.
  if (depth < 4 && typeof value === "object" && value !== null) {
    for (const member of Object.values(value)) {
      exercise(member, depth + 1);
    }
  }
}

async function sweepUiCorpus(): Promise<{ readonly modules: number; readonly calls: number }> {
  const modules = variantModules(UI_SRC);
  cssMergeTrace.enable();
  for (const path of modules) {
    const loaded: Record<string, unknown> = await import(pathToFileURL(path).href);
    for (const value of Object.values(loaded)) {
      exercise(value, 0);
    }
  }
  const snapshot = cssMergeTrace.read();
  return { modules: modules.length, calls: snapshot.calls };
}

test("every @orb/ui variants module merges without a CROSS-GROUP eviction", async () => {
  const swept = await sweepUiCorpus();
  // A bare zero is "I could not measure", never "it isn't there" — the population is asserted first, and
  // the planted controls below prove this read can go red at all.
  expect(swept.modules, "no variants.ts was found — the corpus walk is broken, not clean").toBeGreaterThan(10);
  expect(swept.calls, "no class list reached the merger — the exercise walk is broken, not clean").toBeGreaterThan(swept.modules);
  expect(cssMergeTrace.read(), "a cross-group eviction means a shipped class silently never paints (#2450)").toMatchObject({ status: "ok" });
});

test("PLANTED CONTROL — an unregistered type-scale class evicted by a text COLOR reds the sweep", () => {
  cssMergeTrace.enable();
  // `text-nope` is in no class group Orb registered, so tailwind-merge reads it as a text COLOR and drops
  // it. This is byte-for-byte the #2450 shape; before #2460 it was filed as a plain `orb:color` conflict.
  expect(cn("text-nope", "text-foreground")).toBe("text-foreground");
  const snapshot = cssMergeTrace.read();
  expect(snapshot.status).toBe("instrument-error");
  const error = snapshot.status === "instrument-error" ? snapshot.error : "";
  expect(error, "both sides of the eviction must be named, or the receipt cannot be acted on").toContain('"text-nope"');
  expect(error).toContain('"text-foreground"');
  expect(error).toContain("cross-group eviction");
  // …and it is not filed as a receipt, because a cross-group eviction is never a legitimate override.
  expect(snapshot.receipts).toStrictEqual([]);
});

test("PLANTED CONTROL — a SAME-group override stays an ordinary conflict, not an instrument error", () => {
  cssMergeTrace.enable();
  expect(cn("text-body", "text-field")).toBe("text-field");
  const snapshot = cssMergeTrace.read();
  expect(snapshot.status, "two registered type-scale classes are one axis — the later one winning is the contract").toBe("ok");
  // The axis STRING is `conflictAxis`'s existing first-family-match answer and is asserted by
  // class-merge.test.ts; what this row owns is that the pair is filed as a CONFLICT at all.
  expect(snapshot.receipts[0]?.conflicts[0]).toMatchObject({
    loser: { className: "text-body" },
    winner: { className: "text-field" },
  });
});

// The legitimate overrides the BROAD reading of "cross-group" ("exactly one side carries a token") would
// have condemned: a custom token beating a CORE keyword on the same axis is this repo's most common
// override and must stay an ordinary conflict. Without this row the detector could be tightened into a
// false-positive machine and every one of these would red.
const CORE_KEYWORD_OVERRIDES = [
  ["gap-0", "gap-block"],
  ["h-auto", "h-control-sm"],
  ["rounded-none", "rounded-control"],
  ["leading-tight", "leading-body"],
  ["text-red-500", "text-foreground"],
  ["border-transparent", "border-primary"],
] as const;

test.for(CORE_KEYWORD_OVERRIDES)("a custom token overriding the core keyword %s → %s stays a plain conflict", ([first, second]) => {
  cssMergeTrace.enable();
  expect(cn(first, second)).toBe(second);
  expect(cssMergeTrace.read().status).toBe("ok");
});

test("a cross-group eviction inside a tv() slot reds the same way a bare cn does", () => {
  const recipe = tv({ slots: { root: "text-nope" } })();
  cssMergeTrace.enable();
  expect(recipe.root({ class: "text-foreground" })).toBe("text-foreground");
  expect(cssMergeTrace.read().status).toBe("instrument-error");
});
