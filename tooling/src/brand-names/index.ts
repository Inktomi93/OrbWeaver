// The table that maps an id-named declaration to the brand it stands for. One reader for `pnpm brand-flow` and for
// `orb/no-raw-id`, so the report and the rule never disagree on what a name means.
import { ID_PREFIX } from "@orb/kit/ids";

const pascal = (key: string): string => `${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;

// A name whose brand is spelled differently: the connection brand carries its table prefix, and an owner is a user.
const ALIASES: Readonly<Record<string, string>> = { owner: "UserId", connection: "UserConnectionId", binding: "ConnectionBindingId" };

const BRAND_NAME = /^[A-Z]\w*Id$/u;

// A stem of one word can name a different identity than a brand ending in it (a provider `turnId` is not a
// `ChatTurnId`), so only a stem of two or more words may stand for a brand that spells one more qualifier.
const QUALIFIED_STEM_WORDS = 2;

export interface NameMatch {
  readonly brand: string;
  /** `suffix` is a trailing-word guess (`providerMessageId` is a provider's handle, not a `MessageId`), so only a report reads it. */
  readonly match: "exact" | "qualified" | "suffix" | "alias";
}

/** The table that maps an id-named declaration to a brand: one row per `ID_PREFIX` entity, plus every other brand
 *  met whose name ends in `Id`. */
export class BrandTable {
  readonly #byTokens = new Map<string, string>();
  readonly names: ReadonlySet<string>;

  constructor(seen: Iterable<string>) {
    const names = new Set([...Object.keys(ID_PREFIX).map((key) => `${pascal(key)}Id`), ...[...seen].filter((name) => BRAND_NAME.test(name))]);
    this.names = names;
    for (const name of names) {
      this.#byTokens.set(name.slice(0, -2).toLowerCase(), name);
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
