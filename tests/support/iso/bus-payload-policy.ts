// Native bus assertions inspect resolved wire values, including referenced carriers, in each test world.
// The exceptions name actual economics, folded-name and branded-ID fields, not arbitrary secret-shaped data.
import type { TokenProvenance } from "@orb/contracts/chat";
import type { UserCredentialId } from "@orb/kit/ids";

const FORBIDDEN_WORDS = ["secret", "token", "apikey", "password", "credential", "key"] as const;
type ForbiddenWord = (typeof FORBIDDEN_WORDS)[number];
type Scalar = string | number | boolean | bigint | symbol | null | undefined | void;
const ECONOMICS_FIELDS = ["tokensIn", "tokensOut", "cacheReadTokens", "cacheWriteTokens"] as const;
const VIEW_EVENTS = ["messageCommitted", "messageEdited", "messageHidden", "variantSelected", "reasoningEdited", "reasoningCleared"] as const;
const MAINTENANCE_KINDS = ["assets-backfill", "assets-gc", "import-st"] as const;
export type EconomicsField = (typeof ECONOMICS_FIELDS)[number];
type ViewEvent = (typeof VIEW_EVENTS)[number];
type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];
type FieldPath<P extends string, K extends string | number> = P extends "" ? `${K}` : `${P}.${K}`;

// Empty objects inhabit index key spaces; Required distinguishes optional finite properties.
type OpenKeys<T extends object> = {
  [K in keyof T]-?: Record<never, never> extends Pick<Required<T>, K> ? K : never;
}[keyof T];

type LicensedField<V, Root extends string, Path extends string, Event, Kind> = unknown extends V
  ? false
  : Root extends "chat"
    ? [Event] extends [ViewEvent]
      ? Path extends `view.${EconomicsField}`
        ? [V] extends [number | null]
          ? [number | null] extends [V]
            ? true
            : false
          : false
        : Path extends "view.tokenProvenance"
          ? [V] extends [TokenProvenance]
            ? [TokenProvenance] extends [V]
              ? true
              : false
            : false
          : false
      : false
    : Root extends "user"
      ? [Event] extends ["credentialsChanged"]
        ? Path extends "credentialId"
          ? [V] extends [UserCredentialId | undefined]
            ? [UserCredentialId | undefined] extends [V]
              ? true
              : false
            : false
          : false
        : false
      : Root extends "workload"
        ? [Event] extends ["succeeded"]
          ? [Kind] extends [MaintenanceKind]
            ? Path extends "result.mergedKeys"
              ? [V] extends [readonly string[] | undefined]
                ? [readonly string[] | undefined] extends [V]
                  ? true
                  : false
                : false
              : false
            : false
          : false
        : false;

type FieldFailure<T extends object, K extends keyof T, Root extends string, P extends string, Event, Kind> = K extends string | number
  ?
      | (Lowercase<`${K}`> extends `${string}${ForbiddenWord}${string}`
          ? LicensedField<T[K], Root, FieldPath<P, K>, Event, Kind> extends true
            ? never
            : `${FieldPath<P, K>}:credential-field`
          : never)
      | Walk<T[K], Root, FieldPath<P, K>, Event, Kind>
  : `${P}:symbol-property`;

type ArrayMembers<T extends readonly unknown[]> = Pick<T, Exclude<keyof T, keyof (T extends unknown[] ? unknown[] : readonly unknown[])>>;

// Finite extra keys remain data even when their spelling resembles an array index.
type ArrayFailure<T extends readonly unknown[], Root extends string, P extends string, Event, Kind> = [OpenKeys<ArrayMembers<T>>] extends [never]
  ?
      | Walk<T[number], Root, `${P}[]`, Event, Kind>
      | {
          [K in keyof ArrayMembers<T>]-?: FieldFailure<ArrayMembers<T>, K, Root, P, Event, Kind>;
        }[keyof ArrayMembers<T>]
  : `${P}:open-key-space`;

type Walk<T, Root extends string, P extends string, Event, Kind> = unknown extends T
  ? `${P}:open-value`
  : T extends Scalar
    ? never
    : T extends (...args: never[]) => unknown
      ? `${P}:callable`
      : T extends abstract new (
            ...args: never[]
          ) => unknown
        ? `${P}:constructable`
        : T extends readonly unknown[]
          ? ArrayFailure<T, Root, P, Event, Kind>
          : T extends object
            ? [keyof T] extends [never]
              ? `${P}:keyless-object`
              : [OpenKeys<T>] extends [never]
                ? { [K in keyof T]-?: FieldFailure<T, K, Root, P, Event, Kind> }[keyof T]
                : `${P}:open-key-space`
            : `${P}:unsupported-value`;

/** A closed event contributes no failure; every unsafe resolved arm contributes its field path. */
export type BusPayloadFailure<T, Root extends string = "control"> = [T] extends [never]
  ? ":empty-root"
  : unknown extends T
    ? ":open-root"
    : T extends { readonly type: infer Event extends string }
      ? Record<never, never> extends Pick<Required<Record<Event, true>>, Event>
        ? ":open-discriminator"
        : Walk<T, Root, "", Event, T extends { readonly kind: infer Kind } ? Kind : undefined>
      : ":missing-discriminator";
