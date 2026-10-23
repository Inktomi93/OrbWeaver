// @orb/contracts/bus-registry — every bus event union and the `*_EVENT_TYPES` belt it owns.
// Types prove each belt names exactly its union's discriminators and each sub-union belongs to its root.
import type { AUTOMATION_BUS_EVENT_TYPES, AutomationBusEvent } from "#automation";
import type { CHAT_BUS_EVENT_TYPES, ChatBusEvent } from "#chat";
import type { DOMAIN_EVENT_TYPES, DomainEvent } from "#events";
import type { RPG_BUS_EVENT_TYPES, RpgBusEvent } from "#rpg";
import type { USER_BUS_EVENT_TYPES, UserBusEvent } from "#user-bus";
import type { WiBusEvent } from "#world-info";

/** Root bus unions by bus name, paired with their canonical belts in {@link BusBelts}. */
interface BusUnions {
  readonly automation: AutomationBusEvent;
  readonly chat: ChatBusEvent;
  readonly domain: DomainEvent;
  readonly rpg: RpgBusEvent;
  readonly user: UserBusEvent;
}
export type BusName = keyof BusUnions;

/** The belt each root union owns. {@link BeltMismatch} indexes this by every {@link BusName}, so a union with no belt here is a compile error. */
interface BusBelts {
  readonly automation: typeof AUTOMATION_BUS_EVENT_TYPES;
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
  wi: { alias: "WiBusEvent", root: "chat", file: "packages/contracts/src/world-info/index.ts" },
} as const satisfies {
  readonly [Name in keyof BusSubUnions]: { readonly alias: string; readonly root: BusName; readonly file: string };
};

/** Discriminators a sub-union declares outside its root. */
export type SubUnionEscape = {
  readonly [Name in keyof BusSubUnions]: Exclude<BusSubUnions[Name]["type"], BusUnions[(typeof BUS_SUBUNIONS)[Name]["root"]]["type"]>;
};
