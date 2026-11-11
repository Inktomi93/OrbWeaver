// A JSON column typed open lets a reader outrun its producer (.claude/rules/db.md). This walks every column every
// table selects, through aliases, interfaces, unions, arrays and nested members, and names each one whose type
// still reaches `unknown`, `any`, a bare `object` or `{}`. `JsonValue` and `JsonObject` from `@orb/kit/json` are
// the closed spelling of free-form JSON. A column with no `$type` at all reads `unknown`, so it is named too.
// @subject packages/db/src/schema/index.ts

import type * as schema from "@orb/db/schema";
import type { JsonValue } from "@orb/kit/json";
import type { Table } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { expectTypeOf, test } from "vitest";

// How far below a column the walk descends before it gives up and calls the type open (fail closed).
type Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// A binary column (an embedding vector) is bytes, not JSON, so its typed-array methods are not walked.
type Closed = string | number | boolean | bigint | null | undefined | ArrayBufferView;

// `true` (or `boolean`, for a union with an open member) when an open type is reachable in `T`.
type Open<T, D extends number = 12> = 0 extends 1 & T
  ? true
  : unknown extends T
    ? true
    : [D] extends [never]
      ? true
      : [T] extends [JsonValue]
        ? [JsonValue] extends [T]
          ? false
          : Walk<T, Depth[D]>
        : Walk<T, Depth[D]>;

type Walk<T, D extends number> = T extends Closed
  ? false
  : T extends readonly (infer E)[]
    ? Open<E, D>
    : T extends object
      ? string extends keyof T
        ? Open<T[string], D>
        : [keyof T] extends [never]
          ? true
          : true extends { [K in keyof T]-?: Open<T[K], D> }[keyof T]
            ? true
            : false
      : true;

type Tables = { [K in keyof typeof schema as (typeof schema)[K] extends Table ? K : never]: (typeof schema)[K] };
type RowOf<T> = T extends { $inferSelect: infer R } ? R : never;
type OpenColumnsOf<Row> = { [C in keyof Row]: true extends Open<Row[C]> ? C : never }[keyof Row];

/** Every `table.column` whose selected type reaches an open type. */
type OpenColumns = { [K in keyof Tables]: `${K & string}.${OpenColumnsOf<RowOf<Tables[K]>> & string}` }[keyof Tables];

type OpenAlias = Record<string, unknown>;
interface OpenIndex {
  readonly [key: string]: unknown;
}
interface NestedOpen {
  readonly kind: "nested";
  readonly inner: { readonly items: readonly { readonly payload: OpenAlias }[] };
}
// A JSON column declared with no `$type`, as a schema author could write one; only its type is read.
const untypedJsonTable = sqliteTable("untyped_json_control", { id: text("id").primaryKey(), blob: text("blob", { mode: "json" }) });

test("every column a table selects is closed", () => {
  expectTypeOf<OpenColumns>().toEqualTypeOf<never>();
});

test("the walk names each way a column type can stay open", () => {
  expectTypeOf<OpenColumnsOf<typeof untypedJsonTable.$inferSelect>>().toEqualTypeOf<"blob">();
  expectTypeOf<Open<unknown>>().toEqualTypeOf<true>();
  // `JSON.parse` returns `any`, the type an untyped decode hands a column.
  expectTypeOf<Open<ReturnType<typeof JSON.parse>>>().toEqualTypeOf<true>();
  expectTypeOf<Open<OpenAlias>>().toEqualTypeOf<true>();
  expectTypeOf<Open<OpenIndex>>().toEqualTypeOf<true>();
  expectTypeOf<Open<object>>().toEqualTypeOf<true>();
  // `NonNullable<unknown>` is `{}`, any non-nullish value.
  expectTypeOf<Open<NonNullable<unknown>>>().toEqualTypeOf<true>();
  expectTypeOf<Open<Record<string, object>>>().toEqualTypeOf<true>();
  expectTypeOf<true extends Open<NestedOpen> ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<true extends Open<{ readonly a: number } | OpenAlias> ? true : false>().toEqualTypeOf<true>();
});

test("the walk admits closed JSON and plain row values", () => {
  expectTypeOf<Open<JsonValue>>().toEqualTypeOf<false>();
  expectTypeOf<Open<Record<string, JsonValue>>>().toEqualTypeOf<false>();
  expectTypeOf<Open<Record<string, string>>>().toEqualTypeOf<false>();
  expectTypeOf<Open<readonly { readonly id: string; readonly at: number | null }[]>>().toEqualTypeOf<false>();
});
