// brand-flow: where a branded id is minted, widened to a plain string, laundered back into a brand, or never branded at
// all. Read-only and never a gate. Every world is scanned over the files it is home to, so no file is counted twice.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homeFiles, isProduction, NativeWorld, packageWorlds, TEST_WORLDS } from "../unwired/index.ts";
import type { CompareCandidate, DeclarationCandidate, WorldRecords } from "./collect.ts";
import { collectWorld } from "./collect.ts";
import { BrandTable, sharesBrand } from "./facts.ts";
import { layerOf } from "./slots.ts";
import type { CrossBrandSite, GenericId, MintSite, MissingSite, RenarrowSite, Where, WidenSite } from "./types.ts";

export interface BrandFlowOptions {
  readonly root: string;
  /** The worlds to scan; defaults to every package world, the tooling world and the test worlds. */
  readonly worlds?: readonly string[];
  readonly log: (line: string) => void;
}

/** The worlds that hold repository code: every package, the tooling program, and the test programs. */
export function brandFlowWorlds(root: string): readonly string[] {
  const configs = [...packageWorlds(root), "tooling/tsconfig.json", ...TEST_WORLDS, "tsconfig.tests-iso.json"];
  return configs.filter((config) => existsSync(join(root, config)));
}

export interface BrandFlowReport {
  readonly worlds: readonly { readonly config: string; readonly files: number; readonly brandless: boolean }[];
  readonly scanned: {
    readonly files: number;
    readonly production: number;
    readonly byPackage: Readonly<Record<string, number>>;
    /** Records that share a file, line and kind: a file two worlds both counted. */
    readonly doubleCounted: number;
  };
  readonly brands: readonly string[];
  readonly mints: readonly MintSite[];
  readonly widens: readonly WidenSite[];
  readonly renarrows: readonly RenarrowSite[];
  readonly missing: readonly MissingSite[];
  readonly generic: readonly GenericId[];
  readonly crossBrand: readonly CrossBrandSite[];
}

const count = (values: readonly string[]): Record<string, number> => {
  const counted: Record<string, number> = {};
  for (const value of values) {
    counted[value] = (counted[value] ?? 0) + 1;
  }
  return counted;
};

// The name a slot is declared under: `param` in `callee(param)`, `prop` in `Owner.prop` or `<Tag prop>`, else the last word.
const slotWord = (slotName: string): string | null => /([A-Za-z_]\w*)[)>]*(?: return)?$/u.exec(slotName.replace(/\(\) return$/u, ""))?.[1] ?? null;

function renarrowsOf(mints: readonly MintSite[], compares: readonly CompareCandidate[], widens: readonly WidenSite[]): RenarrowSite[] {
  const bySlot = new Map<string, string[]>();
  for (const widen of widens) {
    // A test that hands a brand to a production slot is no evidence production launders it.
    if (widen.slot.declSite !== null && isProduction(widen.file)) {
      bySlot.set(widen.slot.declSite, [...(bySlot.get(widen.slot.declSite) ?? []), `${widen.file}:${widen.line} ${widen.slot.name}`]);
    }
  }
  const through = (roots: readonly string[]): string[] => roots.flatMap((root) => bySlot.get(root) ?? []);
  const casts = mints
    .filter((mint) => (mint.via === "castId" || mint.via === "as") && mint.mintClass === "raw")
    .flatMap((mint): RenarrowSite[] => {
      const via = through(mint.roots);
      return via.length === 0
        ? []
        : [
            {
              ...here(mint),
              how: mint.via === "castId" ? "castId" : "as",
              brand: mint.brand,
              source: mint.source,
              via,
              proof: "slot-widened",
              provenance: "measured",
            },
          ];
    });
  const compared = compares
    .filter((compare) => !compare.crossed)
    .map((compare): RenarrowSite => {
      const via = through(compare.roots);
      return {
        ...here(compare),
        how: "compare",
        brand: compare.brand,
        source: compare.source,
        via,
        proof: via.length > 0 ? "slot-widened" : "type-only",
        provenance: "measured",
      };
    });
  return [...casts, ...compared];
}

function missingOf(declarations: readonly DeclarationCandidate[], table: BrandTable): { missing: MissingSite[]; generic: GenericId[] } {
  const missing: MissingSite[] = [];
  const unmatched = new Map<string, { count: number; packages: Set<string> }>();
  for (const declared of declarations) {
    const match = table.brandOf(declared.name);
    if (match === null) {
      const entry = unmatched.get(declared.name) ?? { count: 0, packages: new Set<string>() };
      entry.count += 1;
      entry.packages.add(declared.pkg);
      unmatched.set(declared.name, entry);
      continue;
    }
    const slot = { kind: "property" as const, name: declared.name, owner: declared.owner, declSite: null, declFile: declared.file, lib: false };
    missing.push({ ...declared, brand: match.brand, match: match.match, layer: layerOf(slot, declared.file), provenance: "heuristic" });
  }
  const generic = [...unmatched]
    .map(([name, { count: total, packages }]) => ({ name, count: total, packages: [...packages].sort() }))
    .sort((a, b) => b.count - a.count);
  return { missing, generic };
}

function crossBrandOf(table: BrandTable, mints: readonly MintSite[], widens: readonly WidenSite[], compares: readonly CompareCandidate[]): CrossBrandSite[] {
  return [...crossWidens(table, widens), ...crossMints(table, mints), ...crossCompares(table, compares)];
}

const here = ({ file, line, pkg, position }: Where): Where => ({ file, line, pkg, position });
const OR = " | ";

// A widen edge into a slot whose name stands for a different brand than the value it carries.
function crossWidens(table: BrandTable, widens: readonly WidenSite[]): CrossBrandSite[] {
  return widens.flatMap((widen): CrossBrandSite[] => {
    const named = table.brandOf(slotWord(widen.slot.name) ?? "");
    const crossed = named !== null && !sharesBrand(widen.brands, [named.brand]);
    return crossed ? [{ ...here(widen), how: "widen-into-named-slot", value: widen.brands.join(OR), slot: widen.slot.name, provenance: "heuristic" }] : [];
  });
}

// A cast to one brand from a brand, or from a raw string read from a name that stands for another.
function crossMints(table: BrandTable, mints: readonly MintSite[]): CrossBrandSite[] {
  return mints.flatMap((mint): CrossBrandSite[] => {
    if (mint.via !== "castId" && mint.via !== "as") {
      return [];
    }
    if (mint.mintClass === "rebrand") {
      const crossed = !sharesBrand(mint.from, mint.brand.split(OR));
      return crossed ? [{ ...here(mint), how: "rebrand", value: mint.from.join(OR), slot: mint.brand, provenance: "measured" }] : [];
    }
    const named = mint.mintClass === "raw" ? table.brandOf(mint.operandName ?? "") : null;
    const crossed = named !== null && !sharesBrand([named.brand], mint.brand.split(OR));
    return crossed ? [{ ...here(mint), how: "named-for-other-brand", value: mint.operandName ?? "", slot: mint.brand, provenance: "heuristic" }] : [];
  });
}

// Two brands compared, or a brand compared with a string read from a name that stands for another.
function crossCompares(table: BrandTable, compares: readonly CompareCandidate[]): CrossBrandSite[] {
  return compares.flatMap((compare): CrossBrandSite[] => {
    const named = compare.crossed ? null : table.brandOf(compare.plainName ?? "");
    const byName = named !== null && !sharesBrand([named.brand], compare.brand.split(OR));
    if (!(compare.crossed || byName)) {
      return [];
    }
    return [
      {
        ...here(compare),
        how: "compare",
        value: compare.plainName ?? compare.brand,
        slot: compare.brand,
        provenance: compare.crossed ? "measured" : "heuristic",
      },
    ];
  });
}

// One node recorded twice is a file two worlds both scanned; two records on one line are different nodes.
function doubleCounted(keys: readonly string[]): number {
  return keys.length - new Set(keys).size;
}

/** Scan the worlds of `options.root`, one TypeScript 7.1 process at a time. */
export function scanBrandFlow(options: BrandFlowOptions): BrandFlowReport {
  const configs = options.worlds ?? brandFlowWorlds(options.root);
  const homes = homeFiles(configs, NativeWorld.fileLists(options.root, configs));
  const worlds: WorldRecords[] = [];
  for (const config of configs) {
    using world = NativeWorld.open(options.root, config);
    const records = collectWorld(world, homes.get(config) ?? new Set());
    options.log(`${config}: files=${records.files} mints=${records.mints.length} widens=${records.widens.length} declarations=${records.declarations.length}`);
    worlds.push(records);
  }
  const table = new BrandTable(worlds.flatMap((world) => world.seen));
  const mints = worlds.flatMap((world) => world.mints);
  const widens = worlds.flatMap((world) => world.widens);
  const compares = worlds.flatMap((world) => world.compares);
  const { missing, generic } = missingOf(
    worlds.flatMap((world) => world.declarations),
    table,
  );
  const homed = [...homes.values()].flatMap((files) => [...files]);
  return {
    worlds: worlds.map(({ config, files, brandless }) => ({ config, files, brandless })),
    scanned: {
      files: homed.length,
      production: homed.filter(isProduction).length,
      byPackage: count(
        homed.map((file) =>
          file
            .split("/")
            .slice(0, file.startsWith("packages/") ? 2 : 1)
            .join("/"),
        ),
      ),
      doubleCounted: doubleCounted([
        ...mints.map((site) => `mint ${site.via} ${site.file}:${site.position} ${site.source}`),
        ...widens.map((site) => `widen ${site.file}:${site.position} ${site.slot.name} ${site.brands.join()}`),
        ...compares.map((site) => `compare ${site.file}:${site.position} ${site.source}`),
        ...missing.map((site) => `missing ${site.file}:${site.position} ${site.name}`),
      ]),
    },
    brands: [...table.names].sort(),
    mints,
    widens,
    renarrows: renarrowsOf(mints, compares, widens),
    missing,
    generic,
    crossBrand: crossBrandOf(table, mints, widens, compares),
  };
}
