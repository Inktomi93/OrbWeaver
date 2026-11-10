// What the checker says a type is, as far as brands go.
// A brand is any intersection assignable to the constraint of `castId`'s type parameter (`Branded<string>`): every
// brand is assignable to it and a bare string is not. A union is read member by member.
import { ID_PREFIX } from "@orb/kit/ids";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import { constituents, hasFlag } from "../unwired/index.ts";

/** The module whose `castId` constraint names the brand shape. */
export const KIT_IDS = "packages/kit/src/ids/index.ts";

export interface TypeFacts {
  readonly brands: readonly string[];
  /** A member that is plain `string`. */
  readonly plain: boolean;
  /** A member that is a string literal or template. */
  readonly literal: boolean;
  /** A member that is anything else but null and undefined. */
  readonly other: boolean;
}

const NOTHING: readonly number[] = [TypeFlags.Null, TypeFlags.Undefined, TypeFlags.Void];
const LITERAL: readonly number[] = [TypeFlags.StringLiteral, TypeFlags.TemplateLiteral];
const hasAny = (flags: number, wanted: readonly number[]): boolean => wanted.some((flag) => hasFlag(flags, flag));

/** The constraint of `castId`'s type parameter in this world, or null when the world does not hold the ids module. */
export function brandConstraint(world: NativeWorld): Type | null {
  const source = world.files.find((file) => world.siteOf(file).file === KIT_IDS);
  if (source === undefined) {
    return null;
  }
  const { checker } = world;
  const [module] = world.batch([checker.getSymbolOfSourceFile.gen(source.fileName)]);
  const castId: NativeSymbol | undefined = module === undefined ? undefined : [...module.getExports().values()].find((symbol) => symbol.name === "castId");
  if (castId === undefined) {
    return null;
  }
  const [constraint] = world.batch([
    (function* (): APIRequestGenerator<Type | undefined> {
      const [signature] = yield* (yield* checker.getTypeOfSymbol.gen(castId)).getCallSignatures.gen();
      const [parameter] = signature === undefined ? [] : yield* signature.getTypeParameters.gen();
      return parameter === undefined ? undefined : yield* checker.getBaseConstraintOfType.gen(parameter);
    })(),
  ]);
  return constraint ?? null;
}

const pascal = (key: string): string => `${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;

// An entity brand's phantom label is its TypeID prefix; its name is the key's `Id` alias. Any other label names itself.
const NAME_OF_PREFIX = new Map(Object.entries(ID_PREFIX).map(([key, prefix]) => [prefix as string, `${pascal(key)}Id`]));
const BRAND_KEY = /^__@brand@/u;
const PROOF_KEY = /^__@sessionVerified@/u;

/** A sub-brand reads as the brand it refines: a `VerifiedUserId` is a `UserId`. */
const baseBrand = (name: string): string => name.replace(/^Verified/u, "");

/** Whether two sets of brand names share a brand, a sub-brand counting as its parent. */
export const sharesBrand = (left: readonly string[], right: readonly string[]): boolean => {
  const wanted = new Set(right.map(baseBrand));
  return left.some((name) => wanted.has(baseBrand(name)));
};

// The brand's name from its phantom keys, so `TypeIdOf<"chat">` and `ChatId` are one brand however the type was written.
function* brandName(checker: NativeWorld["checker"], brand: Type): APIRequestGenerator<string> {
  const keys = (yield* brand.getProperties.gen()).filter((property) => BRAND_KEY.test(property.name) || PROOF_KEY.test(property.name));
  const types = yield* checker.getTypeOfSymbol.gen(keys);
  const labels = keys.flatMap((key, at) => {
    const type = types[at];
    return BRAND_KEY.test(key.name) && type?.isStringLiteralType() === true ? [type.value] : [];
  });
  const [label] = labels;
  if (label === undefined) {
    return yield* checker.typeToString.gen(brand);
  }
  return `${keys.some((key) => PROOF_KEY.test(key.name)) ? "Verified" : ""}${NAME_OF_PREFIX.get(label) ?? label}`;
}

/** Facts of types, asked once per distinct type of a world. */
export class TypeReader {
  readonly #world: NativeWorld;
  readonly #constraint: Type | null;
  readonly #facts = new Map<number, TypeFacts>();
  /** Every brand name this world met, to build the name table from. */
  readonly seen = new Set<string>();

  constructor(world: NativeWorld, constraint: Type | null) {
    this.#world = world;
    this.#constraint = constraint;
  }

  /** The facts of each type, in order. */
  read(types: readonly Type[]): TypeFacts[] {
    const fresh = [...new Map(types.filter((type) => !this.#facts.has(type.id)).map((type) => [type.id, type])).values()];
    const answers = this.#world.batch(fresh.map((type) => this.#factsOf(type)));
    for (const [at, type] of fresh.entries()) {
      this.#facts.set(type.id, answers[at] as TypeFacts);
    }
    return types.map((type) => this.#facts.get(type.id) as TypeFacts);
  }

  *#factsOf(type: Type): APIRequestGenerator<TypeFacts> {
    const { checker } = this.#world;
    const brands: string[] = [];
    let plain = false;
    let literal = false;
    let other = false;
    for (const member of yield* constituents(type)) {
      if (hasAny(member.flags, NOTHING)) {
        continue;
      }
      if (hasFlag(member.flags, TypeFlags.Intersection) && this.#constraint !== null && (yield* checker.isTypeAssignableTo.gen(member, this.#constraint))) {
        const name = yield* brandName(checker, member);
        this.seen.add(name);
        brands.push(name);
      } else if (hasFlag(member.flags, TypeFlags.String)) {
        plain = true;
      } else if (hasAny(member.flags, LITERAL)) {
        literal = true;
      } else {
        other = true;
      }
    }
    return { brands, plain, literal, other };
  }
}

/** A type that is a plain string slot: it takes any string and names no brand. */
export const takesAnyString = (facts: TypeFacts): boolean => facts.plain && facts.brands.length === 0;
