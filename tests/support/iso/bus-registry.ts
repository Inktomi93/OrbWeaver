// Native type assertions compare production event unions with their discriminator tuples.
// Types prove each belt names exactly its union's discriminators and each sub-union belongs to its root.
import type { CHAT_BUS_EVENT_TYPES, ChatBusEvent } from "@orb/contracts/chat";
import type { DOMAIN_EVENT_TYPES, DomainEvent } from "@orb/contracts/events";
import type { RPG_BUS_EVENT_TYPES, RpgBusEvent } from "@orb/contracts/rpg";
import type { USER_BUS_EVENT_TYPES, UserBusEvent } from "@orb/contracts/user-bus";
import type { WiBusEvent } from "@orb/contracts/world-info";

/** Root bus unions by bus name, paired with their canonical belts in {@link BusBelts}. */
interface BusUnions {
  readonly chat: ChatBusEvent;
  readonly domain: DomainEvent;
  readonly rpg: RpgBusEvent;
  readonly user: UserBusEvent;
}
export type BusName = keyof BusUnions;

/** The belt each root union owns. {@link BeltMismatch} indexes this by every {@link BusName}, so a union with no belt here is a compile error. */
interface BusBelts {
  readonly chat: typeof CHAT_BUS_EVENT_TYPES;
  readonly domain: typeof DOMAIN_EVENT_TYPES;
  readonly rpg: typeof RPG_BUS_EVENT_TYPES;
  readonly user: typeof USER_BUS_EVENT_TYPES;
}

/** Belt members: tuple elements or object keys. */
type BeltMember<Belt> = Belt extends readonly (infer Member)[] ? Member : keyof Belt;

/** Discriminators a belt omits plus members it invents. `never` means the belt is total over the union. */
export type BeltMismatchOf<Union extends { readonly type: string }, Belt> = Exclude<Union["type"], BeltMember<Belt>> | Exclude<BeltMember<Belt>, Union["type"]>;

/** Every registered belt's omitted or invented discriminators. */
export type BeltMismatch = { readonly [Name in BusName]: BeltMismatchOf<BusUnions[Name], BusBelts[Name]> };

/** Sub-unions are spliced into one belted root, so that root's belt already covers their members. An
 *  `Extract`/`Exclude` carve-out of a root is exempt by shape and needs no entry. */
interface BusSubUnions {
  readonly wi: WiBusEvent;
}

const BUS_SUBUNIONS = {
  wi: "chat",
} as const satisfies {
  readonly [Name in keyof BusSubUnions]: BusName;
};

/** Discriminators a sub-union declares outside its root. */
export type SubUnionEscape = {
  readonly [Name in keyof BusSubUnions]: Exclude<BusSubUnions[Name]["type"], BusUnions[(typeof BUS_SUBUNIONS)[Name]]["type"]>;
};
