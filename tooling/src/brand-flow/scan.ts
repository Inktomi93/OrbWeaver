// brand-flow: where a branded id is minted, widened to a plain string, laundered back into a brand, or never branded at
// all. Read-only and never a gate. Every world is scanned over the files it is home to, so no file is counted twice.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BrandVerdict, Inflow } from "../brand-names/index.ts";
import { BrandTable, sharesBrand, siteBrand } from "../brand-names/index.ts";
import { TEST_WORLDS } from "../floor/testing/test-worlds.ts";
import type { OptionalInventory, PluginSources } from "../unwired/index.ts";
import {
  homeFiles,
  isPluginProduction,
  isProduction,
  NativeWorld,
  packageWorlds,
  pluginAuthorWorlds,
  pluginSources,
  publishedSdkSources,
} from "../unwired/index.ts";
import type { BrandedDeclaration, CompareCandidate, DeclarationCandidate, PlainFeed, WorldRecords } from "./collect.ts";
import { collectWorld } from "./collect.ts";
import type { BrandFlowProfile } from "./profile.ts";
import { layerOf } from "./slots.ts";
import type { BrandDisagreement, CrossBrandSite, GenericId, MintSite, MissingSite, RenarrowSite, VocabField, Where, WidenSite } from "./types.ts";
import { joinVocab } from "./vocab.ts";

export interface BrandFlowOptions {
  readonly root: string;
  /** The worlds to scan; defaults to every package world, the tooling world and the test worlds. */
  readonly worlds?: readonly string[];
  readonly log: (line: string) => void;
  /** Measures the run under `--profile`. */
  readonly profile?: BrandFlowProfile | null;
}

/** The worlds that hold repository code: every package, the tooling program, and the test programs. */
export function brandFlowWorlds(root: string): readonly string[] {
  const configs = [...packageWorlds(root), ...pluginAuthorWorlds(root), "tooling/tsconfig.json", ...TEST_WORLDS];
  return configs.filter((config) => existsSync(join(root, config)));
}

/** What the per-world brand scan reports, with the plugin sources its worlds hold; the optional inventory joins it
 *  from the reference graph, which counts those sources as production. */
export type BrandEdgeReport = Omit<BrandFlowReport, keyof OptionalInventory> & { readonly plugins: PluginSources };

export interface BrandFlowReport extends OptionalInventory {
  readonly worlds: readonly { readonly config: string; readonly files: number; readonly brandless: boolean }[];
  readonly scanned: {
    readonly files: number;
    readonly production: number;
    readonly optionalProduction: number;
    readonly byPackage: Readonly<Record<string, number>>;
    /** Records that share a file, line and kind: a file two worlds both counted. */
    readonly doubleCounted: number;
  };
  readonly brands: readonly string[];
  readonly mints: readonly MintSite[];
  readonly widens: readonly WidenSite[];
  readonly renarrows: readonly RenarrowSite[];
  readonly sandboxWire: readonly (DeclarationCandidate & { readonly provenance: "measured" })[];
  readonly missing: readonly MissingSite[];
  readonly generic: readonly GenericId[];
  readonly crossBrand: readonly CrossBrandSite[];
  /** The type's answer beside the name table's: at an id-named declaration typed as a brand, how often the name reads
   *  the brand right or not at all; and every site where the two answers differ. */
  readonly brandAnswers: { readonly agree: number; readonly unnamed: number; readonly disagreements: readonly BrandDisagreement[] };
  readonly vocabularies: readonly VocabField[];
}

const count = (values: readonly string[]): Record<string, number> => {
  const counted: Record<string, number> = {};
  for (const value of values) {
    counted[value] = (counted[value] ?? 0) + 1;
  }
  return counted;
};

// The name a slot is declared under: `param` in `callee(param)`, `prop` in `Owner.prop` or `<Tag prop>`, else the last word.
const slotWord = (slotName: string): string | null => /\b([A-Za-z_]\w*)[)>]*(?: return)?$/u.exec(slotName.replace(/\(\) return$/u, ""))?.[1] ?? null;

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

// The brands handed to each declaration, by its site. A test that hands a brand to a production slot is no evidence of
// what production holds there.
function inflowOf(widens: readonly WidenSite[]): ReadonlyMap<string, readonly string[]> {
  const bySite = new Map<string, Set<string>>();
  for (const { slot, file, brands } of widens) {
    if (slot.declSite === null || (isProduction(slot.declFile ?? "") && !isProduction(file))) {
      continue;
    }
    const held = bySite.get(slot.declSite) ?? new Set<string>();
    for (const brand of brands) {
      held.add(brand);
    }
    bySite.set(slot.declSite, held);
  }
  return new Map([...bySite].map(([site, held]) => [site, [...held].sort()]));
}

// The declarations only a library's own value reaches, by site: a production declaration counts only production feeds.
function libraryHandlesOf(feeds: readonly PlainFeed[]): ReadonlySet<string> {
  const library = new Set<string>();
  const own = new Set<string>();
  for (const { declSite, declFile, file, library: fromLibrary } of feeds) {
    if (!isProduction(declFile ?? "") || isProduction(file)) {
      (fromLibrary ? library : own).add(declSite);
    }
  }
  return new Set([...library].filter((site) => !own.has(site)));
}

const here = ({ file, line, pkg, position }: Where): Where => ({ file, line, pkg, position });
const OR = " | ";

/** One site's brand, from what flows into it before what it is named, with each disagreement kept. */
class SiteAnswers {
  readonly disagreements: BrandDisagreement[] = [];
  agree = 0;
  unnamed = 0;
  readonly #table: BrandTable;
  readonly #inflow: ReadonlyMap<string, readonly string[]>;
  readonly #handles: ReadonlySet<string>;

  constructor(table: BrandTable, inflow: ReadonlyMap<string, readonly string[]>, handles: ReadonlySet<string>) {
    this.#table = table;
    this.#inflow = inflow;
    this.#handles = handles;
  }

  /** The name table's answer alone, for a slot whose own value is the type's answer. */
  named(name: string): BrandVerdict["named"] {
    return this.#table.brandOf(name);
  }

  /** The brand of a plain site whose value comes from the declarations at `sites`. */
  plain(kind: Exclude<BrandDisagreement["kind"], "branded-declaration">, where: Where, name: string, sites: readonly string[]): BrandVerdict {
    const brands = [...new Set(sites.flatMap((site) => this.#inflow.get(site) ?? []))].sort();
    const foreign = sites.length > 0 && sites.every((site) => this.#handles.has(site));
    const inflow: Inflow | undefined = brands.length === 0 && !foreign ? undefined : { brands, foreign };
    const verdict = siteBrand(inflow, this.#table.brandOf(name));
    if (verdict.disagrees) {
      this.disagreements.push({ ...here(where), kind, name, typed: brands, named: verdict.named });
    }
    return verdict;
  }

  // A declaration typed as a brand: the type is the answer, and the name is only measured against it.
  branded(declared: BrandedDeclaration): void {
    const verdict = siteBrand({ brands: declared.brands, foreign: false }, this.#table.brandOf(declared.name));
    if (verdict.named === null) {
      this.unnamed += 1;
    } else if (verdict.disagrees) {
      this.disagreements.push({ ...here(declared), kind: "branded-declaration", name: declared.name, typed: declared.brands, named: verdict.named });
    } else {
      this.agree += 1;
    }
  }
}

function missingOf(declarations: readonly DeclarationCandidate[], answers: SiteAnswers): { missing: MissingSite[]; generic: GenericId[] } {
  const missing: MissingSite[] = [];
  const unmatched = new Map<string, { count: number; packages: Set<string> }>();
  for (const declared of declarations) {
    const { brand, match, named } = answers.plain("declaration", declared, declared.name, [declared.site]);
    // A name a library's own value fills is that library's handle: neither missing a brand nor a generic id.
    if (brand === null && named !== null) {
      continue;
    }
    if (brand === null || match === null) {
      const entry = unmatched.get(declared.name) ?? { count: 0, packages: new Set<string>() };
      entry.count += 1;
      entry.packages.add(declared.pkg);
      unmatched.set(declared.name, entry);
      continue;
    }
    if (declared.sandboxBrands.length > 0 && declared.sandboxBrands.every((sandbox) => sharesBrand([sandbox], brand.split(OR)))) {
      continue;
    }
    const slot = {
      kind: "property" as const,
      name: declared.name,
      owner: declared.owner,
      declSite: null,
      declFile: declared.file,
      lib: false,
      declared: "plain" as const,
    };
    missing.push({
      ...here(declared),
      name: declared.name,
      owner: declared.owner,
      declKind: declared.declKind,
      shape: declared.shape,
      brand,
      match,
      layer: layerOf(slot, declared.file),
      provenance: match === "type" ? "measured" : "heuristic",
    });
  }
  const generic = [...unmatched]
    .map(([name, { count: total, packages }]) => ({ name, count: total, packages: [...packages].sort() }))
    .sort((a, b) => b.count - a.count);
  return { missing, generic };
}

function crossBrandOf(answers: SiteAnswers, mints: readonly MintSite[], widens: readonly WidenSite[], compares: readonly CompareCandidate[]): CrossBrandSite[] {
  return [...crossWidens(answers, widens), ...crossMints(answers, mints), ...crossCompares(answers, compares)];
}

// A slot whose name is all the program says about it: a library's own field, which the program cannot retype, and an
// owner-less property whose declaration reads as no type (a property of a literal no declared type names).
const namedOnly = ({ lib, kind, owner, declared }: WidenSite["slot"]): boolean => lib || (kind === "property" && owner === null && declared === "unknown");

// A widen edge into a slot whose name stands for a different brand than the value it carries. The value's brand is the
// type's answer for the slot, so this row is the name and the type disagreeing; a slot only a name describes is no row.
function crossWidens(answers: SiteAnswers, widens: readonly WidenSite[]): CrossBrandSite[] {
  return widens.flatMap((widen): CrossBrandSite[] => {
    if (namedOnly(widen.slot)) {
      return [];
    }
    const named = answers.named(slotWord(widen.slot.name) ?? "");
    const crossed = named !== null && !sharesBrand(widen.brands, [named.brand]);
    return crossed ? [{ ...here(widen), how: "widen-into-named-slot", value: widen.brands.join(OR), slot: widen.slot.name, provenance: "heuristic" }] : [];
  });
}

// A cast to one brand of a value that holds another: a brand, a string some other brand flows into, or a raw string read
// from a name that stands for another.
function crossMints(answers: SiteAnswers, mints: readonly MintSite[]): CrossBrandSite[] {
  return mints.flatMap((mint): CrossBrandSite[] => {
    if (mint.via !== "castId" && mint.via !== "as") {
      return [];
    }
    if (mint.mintClass === "rebrand") {
      const crossed = !sharesBrand(mint.from, mint.brand.split(OR));
      return crossed ? [{ ...here(mint), how: "rebrand", value: mint.from.join(OR), slot: mint.brand, provenance: "measured" }] : [];
    }
    return mint.mintClass === "raw" ? crossRawMint(answers, mint) : [];
  });
}

// A raw operand's brand is what flows into the declarations it reads, else what its name stands for.
function crossRawMint(answers: SiteAnswers, mint: MintSite): CrossBrandSite[] {
  const held = answers.plain("mint-operand", mint, mint.operandName ?? "", mint.roots);
  if (held.brand === null || sharesBrand(held.brand.split(OR), mint.brand.split(OR))) {
    return [];
  }
  return held.match === "type"
    ? [{ ...here(mint), how: "fed-other-brand", value: held.brand, slot: mint.brand, provenance: "measured" }]
    : [{ ...here(mint), how: "named-for-other-brand", value: mint.operandName ?? "", slot: mint.brand, provenance: "heuristic" }];
}

// Two brands compared, or a brand compared with a string that holds another by what flows into it or by its name.
function crossCompares(answers: SiteAnswers, compares: readonly CompareCandidate[]): CrossBrandSite[] {
  return compares.flatMap((compare): CrossBrandSite[] => {
    if (compare.crossed) {
      return [{ ...here(compare), how: "compare", value: compare.plainName ?? compare.brand, slot: compare.brand, provenance: "measured" }];
    }
    const held = answers.plain("compare-operand", compare, compare.plainName ?? "", compare.roots);
    if (held.brand === null || sharesBrand(held.brand.split(OR), compare.brand.split(OR))) {
      return [];
    }
    const typed = held.match === "type";
    return [
      {
        ...here(compare),
        how: "compare",
        value: typed ? held.brand : (compare.plainName ?? ""),
        slot: compare.brand,
        provenance: typed ? "measured" : "heuristic",
      },
    ];
  });
}

// One node recorded twice is a file two worlds both scanned; two records on one line are different nodes.
function doubleCounted(keys: readonly string[]): number {
  return keys.length - new Set(keys).size;
}

/** Measure brand edges in the selected sources using their owning program's types. A re-narrow is proven
 * when its incoming widen also occurs in the selection.
 * @throws When the program cannot supply a requested source or the brand definitions. */
export function scanBrandEdgesAt(root: string, config: string, files: readonly string[]): Pick<BrandFlowReport, "widens" | "renarrows"> {
  using world = NativeWorld.open(root, config, publishedSdkSources(root));
  const selected = new Set(files);
  for (const file of selected) {
    if (!world.has(file)) {
      throw new Error(`${file} is outside the compiler program ${config}`);
    }
  }
  const records = collectWorld(world, selected);
  if (records.brandless) {
    throw new Error(`${config} does not contain the brand definitions`);
  }
  return { widens: records.widens, renarrows: renarrowsOf(records.mints, records.compares, records.widens) };
}

/** Scan the worlds of `options.root`, one TypeScript 7.1 process at a time. */
export function scanBrandFlow(options: BrandFlowOptions): BrandEdgeReport {
  const profile = options.profile ?? null;
  const time = <T>(phase: "open" | "walk" | "analyse", work: () => T): T => (profile === null ? work() : profile.time(phase, work));
  const configs = options.worlds ?? brandFlowWorlds(options.root);
  const sdk = publishedSdkSources(options.root);
  const lists = time("open", () => NativeWorld.fileLists(options.root, configs, sdk));
  const homes = homeFiles(configs, lists);
  const authorWorlds = pluginAuthorWorlds(options.root);
  const plugins = pluginSources(
    lists,
    configs.filter((config) => authorWorlds.includes(config)),
  );
  const worlds: WorldRecords[] = [];
  for (const config of configs) {
    {
      using world = time("open", () => NativeWorld.open(options.root, config, sdk, profile !== null));
      profile?.opened(world);
      const home = homes.get(config) ?? new Set<string>();
      const records = time("walk", () => collectWorld(world, home));
      profile?.closing(world);
      options.log(
        `${config}: files=${records.files} mints=${records.mints.length} widens=${records.widens.length} declarations=${records.declarations.length}`,
      );
      worlds.push(records);
    }
    if (profile !== null) {
      options.log(`${config}: node heap after close=${String(profile.closed(config))}MB`);
    }
  }
  return time("analyse", () => joinWorlds({ worlds, homes, plugins }));
}

// Every world's records joined into the report: the name table, the inflow each declaration receives, and the rows
// that need more than one world's records.
function joinWorlds({
  worlds,
  homes,
  plugins,
}: {
  readonly worlds: readonly WorldRecords[];
  readonly homes: ReadonlyMap<string, ReadonlySet<string>>;
  readonly plugins: PluginSources;
}): BrandEdgeReport {
  const table = new BrandTable(worlds.flatMap((world) => world.seen));
  const mints = worlds.flatMap((world) => world.mints);
  const declarations = worlds.flatMap((world) => world.declarations);
  const sandboxWire = declarations.filter((site) => site.sandboxBrands.length > 0).map((site) => ({ ...site, provenance: "measured" as const }));
  const bySlot = new Map(sandboxWire.map((site) => [site.site, site.sandboxBrands]));
  const widens = worlds
    .flatMap((world) => world.widens)
    .map((widen): WidenSite => {
      const wire = widen.slot.declSite === null ? undefined : bySlot.get(widen.slot.declSite);
      return wire !== undefined && widen.brands.every((brand) => sharesBrand([brand], wire)) ? { ...widen, layer: "sandbox-wire" } : widen;
    });
  const compares = worlds.flatMap((world) => world.compares);
  const answers = new SiteAnswers(table, inflowOf(widens), libraryHandlesOf(worlds.flatMap((world) => world.plainFeeds)));
  const { missing, generic } = missingOf(declarations, answers);
  const crossBrand = crossBrandOf(answers, mints, widens, compares);
  for (const declared of worlds.flatMap((world) => world.branded)) {
    answers.branded(declared);
  }
  const homed = [...homes.values()].flatMap((files) => [...files]);
  return {
    plugins,
    worlds: worlds.map(({ config, files, brandless }) => ({ config, files, brandless })),
    scanned: {
      ...scannedFiles(homed, plugins),
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
    sandboxWire,
    missing,
    generic,
    crossBrand,
    brandAnswers: { agree: answers.agree, unnamed: answers.unnamed, disagreements: answers.disagreements },
    vocabularies: joinVocab(worlds.map((world) => ({ declarations: world.vocabDeclarations, observations: world.vocabObservations }))),
  };
}

function scannedFiles(homed: readonly string[], plugins: PluginSources): Omit<BrandFlowReport["scanned"], "doubleCounted"> {
  return {
    files: homed.length,
    production: homed.filter(isProduction).length,
    optionalProduction: homed.filter((file) => isPluginProduction(file, plugins)).length,
    byPackage: count(
      homed.map((file) =>
        file
          .split("/")
          .slice(0, file.startsWith("packages/") ? 2 : 1)
          .join("/"),
      ),
    ),
  };
}
