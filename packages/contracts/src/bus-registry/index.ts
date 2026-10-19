// @orb/contracts/bus-registry — every bus event union and the `*_EVENT_TYPES` belt it owns.
// Types prove each belt names exactly its union's discriminators; `BUSES` names the one file that declares each
// pair so lint can refuse a same-named alias or belt anywhere else (`orb/bus-union-registered`, `orb/bus-home-*`).
import type { AUTOMATION_BUS_EVENT_TYPES, AutomationBusEvent } from "#automation";
import type { CHAT_BUS_EVENT_TYPES, ChatBusEvent } from "#chat";
import type { DOMAIN_EVENT_TYPES, DomainEvent } from "#events";
import type { RPG_BUS_EVENT_TYPES, RpgBusEvent } from "#rpg";
import type { USER_BUS_EVENT_TYPES, UserBusEvent } from "#user-bus";
import type { WiBusEvent } from "#world-info";

/** Root bus unions by bus name. A new bus is declared here, in {@link BusBelts} and in {@link BUSES}. */
interface BusUnions {
  readonly automation: AutomationBusEvent;
  readonly chat: ChatBusEvent;
  readonly domain: DomainEvent;
  readonly rpg: RpgBusEvent;
  readonly user: UserBusEvent;
}
/** @public test-anchored: the type test keys its assertions by bus name. */
export type BusName = keyof BusUnions;

/** The belt each root union owns. {@link BeltMismatch} indexes this by every {@link BusName}, so a union with no belt here is a compile error. */
interface BusBelts {
  readonly automation: typeof AUTOMATION_BUS_EVENT_TYPES;
  readonly chat: typeof CHAT_BUS_EVENT_TYPES;
  readonly domain: typeof DOMAIN_EVENT_TYPES;
  readonly rpg: typeof RPG_BUS_EVENT_TYPES;
  readonly user: typeof USER_BUS_EVENT_TYPES;
}

interface BusHome {
  readonly alias: string;
  readonly belt: string;
  readonly file: string;
}

/** Where each root union and its belt are declared. Lint reads this table: a `*BusEvent`/`DomainEvent` alias or a
 *  belt-shaped `*_EVENT_TYPES` const that is not listed here is refused, and a listed name declared outside its
 *  `file` is refused. `satisfies` makes the table total over {@link BusName}. */
export const BUSES = {
  automation: { alias: "AutomationBusEvent", belt: "AUTOMATION_BUS_EVENT_TYPES", file: "packages/contracts/src/automation/index.ts" },
  chat: { alias: "ChatBusEvent", belt: "CHAT_BUS_EVENT_TYPES", file: "packages/contracts/src/chat/bus.ts" },
  domain: { alias: "DomainEvent", belt: "DOMAIN_EVENT_TYPES", file: "packages/contracts/src/events/index.ts" },
  rpg: { alias: "RpgBusEvent", belt: "RPG_BUS_EVENT_TYPES", file: "packages/contracts/src/rpg/bus.ts" },
  user: { alias: "UserBusEvent", belt: "USER_BUS_EVENT_TYPES", file: "packages/contracts/src/user-bus/index.ts" },
} as const satisfies Readonly<Record<BusName, BusHome>>;

/** Belt members: tuple elements or object keys. */
type BeltMember<Belt> = Belt extends readonly (infer Member)[] ? Member : keyof Belt;

/** @public test-anchored: the type test plants omitted and invented members through it.
 *  Discriminators a belt omits plus members it invents. `never` means the belt is total over the union. */
export type BeltMismatchOf<Union extends { readonly type: string }, Belt> = Exclude<Union["type"], BeltMember<Belt>> | Exclude<BeltMember<Belt>, Union["type"]>;

/** @public test-anchored: the type test holds every registered belt at `never`. */
export type BeltMismatch = { readonly [Name in BusName]: BeltMismatchOf<BusUnions[Name], BusBelts[Name]> };

/** Sub-unions are spliced into one belted root, so that root's belt already covers their members. An
 *  `Extract`/`Exclude` carve-out of a root is exempt by shape and needs no entry. */
interface BusSubUnions {
  readonly wi: WiBusEvent;
}

export const BUS_SUBUNIONS = {
  wi: { alias: "WiBusEvent", root: "chat", file: "packages/contracts/src/world-info/index.ts" },
} as const satisfies {
  readonly [Name in keyof BusSubUnions]: { readonly alias: string; readonly root: BusName; readonly file: string };
};

/** @public test-anchored: the type test holds every sub-union inside its root at `never`. */
export type SubUnionEscape = {
  readonly [Name in keyof BusSubUnions]: Exclude<BusSubUnions[Name]["type"], BusUnions[(typeof BUS_SUBUNIONS)[Name]["root"]]["type"]>;
};
