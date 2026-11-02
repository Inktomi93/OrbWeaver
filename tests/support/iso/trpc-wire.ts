import type { Branded } from "@orb/kit/ids";

/** JSON-facing values keep their compile-time ID brands, so a captured id reaches a branded input as itself. */
export type TrpcWire<T> =
  T extends Branded<string>
    ? T
    : T extends readonly (infer Item)[]
      ? readonly TrpcWire<Item>[]
      : T extends object
        ? { readonly [K in keyof T]: TrpcWire<T[K]> }
        : T;
