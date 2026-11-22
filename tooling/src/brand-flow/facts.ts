// What the checker says a type is, as far as brands go.
// A brand is any intersection assignable to the constraint of `castId`'s type parameter (`Branded<string>`): every
// brand is assignable to it and a bare string is not. A union is read member by member.
import { isLiteralTypeNode, isStringLiteral, isTypeAliasDeclaration, isTypeReferenceNode } from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import { BRAND_MAKERS, brandOfLabel, brandOfPhantomKeys, isPhantomKey, TYPE_ID_BRANDS } from "../brand-names/index.ts";
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

/** The brands a world declares: each alias declared as a kit brand maker with a literal label, named by that label, the
 *  maker resolved by the checker to the kit ids module so a local generic of the same name declares nothing; and every
 *  `ID_PREFIX` entity. */
export function brandDeclarations(world: NativeWorld): ReadonlySet<string> {
  const made = world.files.flatMap((file) =>
    file.statements.flatMap((statement) => {
      if (!(isTypeAliasDeclaration(statement) && isTypeReferenceNode(statement.type) && BRAND_MAKERS.has(statement.type.typeName.getText()))) {
        return [];
      }
      const [label] = statement.type.typeArguments ?? [];
      return label !== undefined && isLiteralTypeNode(label) && isStringLiteral(label.literal)
        ? [{ maker: statement.type.typeName, label: label.literal.text }]
        : [];
    }),
  );
  const makers = world.symbolsAt(made.map(({ maker }) => maker));
  const declared = new Set(TYPE_ID_BRANDS);
  for (const [at, { label }] of made.entries()) {
    const site = makers[at]?.declarations[0];
    if (site !== undefined && world.fileOf(site) === KIT_IDS) {
      declared.add(brandOfLabel(label, false));
    }
  }
  return declared;
}

// The brand's name from its phantom keys, read through this compiler API and named by the one reader.
function* brandName(checker: NativeWorld["checker"], brand: Type): APIRequestGenerator<string> {
  const keys = (yield* brand.getProperties.gen()).filter((property) => isPhantomKey(property.name));
  const types = yield* checker.getTypeOfSymbol.gen(keys);
  const named = brandOfPhantomKeys(
    keys.map((key, at) => {
      const type = types[at];
      return { name: key.name, literal: type?.isStringLiteralType() === true ? type.value : undefined };
    }),
  );
  return named ?? (yield* checker.typeToString.gen(brand));
}

/** Facts of types, asked once per distinct type of a world. */
export class TypeReader {
  readonly #world: NativeWorld;
  readonly #constraint: Type | null;
  readonly #facts = new Map<number, TypeFacts>();
  /** Every brand this world declares or met, to build the name table from. */
  readonly seen: Set<string>;

  constructor(world: NativeWorld, constraint: Type | null, declared: ReadonlySet<string>) {
    this.#world = world;
    this.#constraint = constraint;
    this.seen = new Set(declared);
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
