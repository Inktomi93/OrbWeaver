// These imports root every pure client/UI door in the existing Node type program. Browser re-exports
// must fail compilation here; the type assertion also rejects a DOM-enabled compiler program.
import "@orb/client/data";
import "@orb/client/forms";
import "@orb/client/lib";
import "@orb/client/state";
import "@orb/ui/lib";
import type { HTMLElementTagNameMap, SVGElementTagNameMap } from "browser-realm-types";
import { expectTypeOf, test } from "vitest";

test("pure client and UI doors remain importable without a document global", () => {
  expectTypeOf<"document" extends keyof typeof globalThis ? true : false>().toEqualTypeOf<false>();
});

test("Node browser automation keeps the selected element's remote type", () => {
  expectTypeOf<HTMLElementTagNameMap["input"]["value"]>().toEqualTypeOf<string>();
  expectTypeOf<HTMLElementTagNameMap["a"]>().not.toExtend<HTMLElementTagNameMap["input"]>();
  expectTypeOf<SVGElementTagNameMap["path"]["getTotalLength"]>().returns.toEqualTypeOf<number>();
});
