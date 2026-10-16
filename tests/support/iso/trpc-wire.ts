import type { Branded } from "@orb/kit/ids";

/** JSON-facing values erase compile-time ID brands without importing a concrete router. */
export type TrpcWire<T> =
  T extends Branded<string>
    ? string
    : T extends readonly (infer Item)[]
      ? readonly TrpcWire<Item>[]
      : T extends object
        ? { readonly [K in keyof T]: TrpcWire<T[K]> }
        : T;
