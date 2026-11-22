// The one home of what an id brand is called, and of the two answers a site's brand can have. One reader for
// `pnpm brand-flow` and for `orb/no-raw-id`, so the report and the rule never disagree on what a site holds.
//
// - A brand is keyed by its phantom label: every type the checker resolves to the kit's `Branded<L>` (`TypeIdOf`
//   included), wherever it is declared, file-local and non-id brands too. Never a spelling pattern: brand-flow's set is
//   every alias declared as one of {@link BRAND_MAKERS} with a literal label plus every `ID_PREFIX` entity, and
//   `orb/no-raw-id`'s is the `ID_PREFIX` entities plus the brands its own file references.
// - Both read a brand's name through {@link brandOfPhantomKeys}, each compiler API handing it the phantom keys it read, and
//   both judge a site through {@link siteBrand}: the brands that flow in, else a library's own value when it is all that
//   flows in, else the name. The rule sees the flows of its own file, the report those of each world.
// - A typed site's brand is its type's: the declared brand, or the brands of the values that flow into a plain string.
//   The name table guesses from a declaration's spelling and answers only a plain site no branded value is seen to reach.

import { ID_PREFIX } from "@orb/kit/ids";

/** The kit generics whose alias declares a brand: `type ChatId = TypeIdOf<"chat">`, `type UserId = Branded<"UserId">`. */
export const BRAND_MAKERS: ReadonlySet<string> = new Set(["Branded", "TypeIdOf"]);

const pascal = (key: string): string => `${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;

// A TypeID brand's label is its prefix; it reads as the `ID_PREFIX` key's `Id` name. Any other label names itself.
const NAME_OF_PREFIX: ReadonlyMap<string, string> = new Map(Object.entries(ID_PREFIX).map(([key, prefix]) => [prefix as string, `${pascal(key)}Id`]));

/** Every TypeID entity's brand, declared by `ID_PREFIX` whether or not an alias names it. */
export const TYPE_ID_BRANDS: readonly string[] = [...NAME_OF_PREFIX.values()];

// The phantom key every brand carries, its value the brand's label, and the key a session-verified sub-brand adds.
const BRAND_LABEL_KEY = /^__@brand@/u;
const PROOF_KEY = /^__@sessionVerified@/u;

/** Whether a property name is one of a brand's phantom keys, the only properties {@link brandOfPhantomKeys} reads. */
export const isPhantomKey = (name: string): boolean => BRAND_LABEL_KEY.test(name) || PROOF_KEY.test(name);

/** A phantom key as a compiler API hands it over: its name, and its type's string literal when it has one. */
export interface PhantomKey {
  readonly name: string;
  readonly literal: string | undefined;
}

/** A brand's name from its phantom keys and their literal types, whichever compiler API read them: the label's name, so
 *  `TypeIdOf<"chat">` and `ChatId` are one brand however the type was written, and a local alias
 *  (`type ChatHandle = Branded<"PluginChatHandle">`) is the brand its label names. Undefined for a brand with no literal
 *  label, which the caller names by the checker's spelling. */
export function brandOfPhantomKeys(keys: readonly PhantomKey[]): string | undefined {
  const label = keys.find((key) => BRAND_LABEL_KEY.test(key.name))?.literal;
  return label === undefined
    ? undefined
    : brandOfLabel(
        label,
        keys.some((key) => PROOF_KEY.test(key.name)),
      );
}

/** A brand's name from its literal label alone, for a label read from syntax. */
export const brandOfLabel = (label: string, verified: boolean): string => `${verified ? "Verified" : ""}${NAME_OF_PREFIX.get(label) ?? label}`;

/** What a compiler program says of the file a declaration sits in. */
export interface SourceOrigin {
  /** The program loaded the file as an external library: it was resolved through `node_modules`. */
  readonly external: boolean;
  /** The file belongs to one of the workspace's own packages, which pnpm links into `node_modules`, so the program
   *  flags it external too. */
  readonly workspacePackage: boolean;
}

/** A library's own file: the program loaded it as external, and it is no workspace package. Both readers judge a
 *  library by this contract, each asking its own program and never a path's text: `orb/no-raw-id` asks the TypeScript 6
 *  program here, and brand-flow asks the 7.1 program through {@link NativeWorld.packageOf}, which answers the same way. */
export const isLibrarySource = ({ external, workspacePackage }: SourceOrigin): boolean => external && !workspacePackage;

/** A sub-brand reads as the brand it refines: a `VerifiedUserId` is a `UserId`. */
const baseBrand = (name: string): string => name.replace(/^Verified/u, "");

/** Whether two sets of brand names share a brand, a sub-brand counting as its parent. */
export const sharesBrand = (left: readonly string[], right: readonly string[]): boolean => {
  const wanted = new Set(right.map(baseBrand));
  return left.some((name) => wanted.has(baseBrand(name)));
};

// A name whose brand is spelled differently: the connection brand carries its table prefix, and an owner is a user.
const ALIASES: Readonly<Record<string, string>> = { owner: "UserId", connection: "UserConnectionId", binding: "ConnectionBindingId" };

// An id-named declaration stands only for an id brand, so a brand that does not end in `Id` (`Handle`) has no stem.
const ID_SUFFIX = "Id";

// A stem of one word can name a different identity than a brand ending in it (a provider `turnId` is not a
// `ChatTurnId`), so only a stem of two or more words may stand for a brand that spells one more qualifier.
const QUALIFIED_STEM_WORDS = 2;

const NAME_MATCHES = ["exact", "qualified", "suffix", "alias"] as const;
const BRAND_MATCHES = ["type", ...NAME_MATCHES] as const;
/** How a site's brand was found: `type` when a branded value flows into it, else how its name matched. */
export type BrandMatch = (typeof BRAND_MATCHES)[number];

export interface NameMatch {
  readonly brand: string;
  /** `suffix` is a trailing-word guess (`providerMessageId` is a provider's handle, not a `MessageId`), so only a report reads it. */
  readonly match: (typeof NAME_MATCHES)[number];
}

/** What the checker saw flow into a site. */
export interface Inflow {
  /** The brands of the values handed to the site. */
  readonly brands: readonly string[];
  /** Every value handed to the site is read from a library's own declaration: the site holds that library's handle. A
   *  site the code also hands its own plain strings is not foreign, so its name still answers. */
  readonly foreign: boolean;
}

/** A site's brand, and whether the name table would have named another. */
export interface BrandVerdict {
  readonly brand: string | null;
  readonly match: BrandMatch | null;
  readonly named: NameMatch | null;
  /** The type and the name answer differently: a renamed id, a lookalike, or a foreign handle under a brand's name. */
  readonly disagrees: boolean;
}

/** The type's answer where a branded or foreign value flows into the site, the name's answer only where none does. */
export function siteBrand(inflow: Inflow | undefined, named: NameMatch | null): BrandVerdict {
  if (inflow !== undefined && inflow.brands.length > 0) {
    const disagrees = named === null || !sharesBrand(inflow.brands, [named.brand]);
    return { brand: inflow.brands.toSorted().join(" | "), match: "type", named, disagrees };
  }
  if (inflow?.foreign === true) {
    return { brand: null, match: null, named, disagrees: named !== null };
  }
  return { brand: named?.brand ?? null, match: named?.match ?? null, named, disagrees: false };
}

/** The table that maps an id-named declaration to a brand: one row per declared brand. It answers for a plain site no
 *  branded value is seen to reach. */
export class BrandTable {
  readonly #byTokens = new Map<string, string>();
  readonly names: ReadonlySet<string>;

  constructor(brands: Iterable<string>) {
    const names = new Set(brands);
    this.names = names;
    for (const name of names) {
      if (name.endsWith(ID_SUFFIX)) {
        this.#byTokens.set(name.slice(0, -ID_SUFFIX.length).toLowerCase(), name);
      }
    }
  }

  /** The brand a camelCase id-named declaration stands for: its whole stem, its stem with the brand's leading qualifier left
   *  off (`sdkSessionId` for `AgentSdkSessionId`), its trailing words, or an alias. */
  brandOf(declared: string): NameMatch | null {
    const stem = /^([a-z].*?)Ids?$/u.exec(declared)?.[1];
    if (stem === undefined) {
      return null;
    }
    const words = stem.split(/(?=[A-Z])/u);
    const whole = stem.toLowerCase();
    const exact = this.#byTokens.get(whole);
    if (exact !== undefined) {
      return { brand: exact, match: "exact" };
    }
    const qualified = words.length >= QUALIFIED_STEM_WORDS ? [...this.#byTokens].filter(([token]) => token.endsWith(whole)) : [];
    if (qualified.length === 1) {
      return { brand: (qualified[0] as [string, string])[1], match: "qualified" };
    }
    for (let start = 1; start < words.length; start += 1) {
      const brand = this.#byTokens.get(words.slice(start).join("").toLowerCase());
      if (brand !== undefined) {
        return { brand, match: "suffix" };
      }
    }
    const alias = ALIASES[words.at(-1)?.toLowerCase() ?? ""];
    return alias !== undefined && this.names.has(alias) ? { brand: alias, match: "alias" } : null;
  }
}
