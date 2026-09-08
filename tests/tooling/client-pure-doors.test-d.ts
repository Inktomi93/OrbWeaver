// These imports root every pure client/UI door in the existing Node type program. Browser re-exports
// must fail compilation here; the type assertion also rejects a DOM-enabled compiler program.
import "@orb/client/data";
import "@orb/client/forms";
import "@orb/client/lib";
import "@orb/client/state";
import "@orb/ui/lib";
import { expectTypeOf, test } from "vitest";

test("pure client and UI doors remain importable without a document global", () => {
  expectTypeOf<"document" extends keyof typeof globalThis ? true : false>().toEqualTypeOf<false>();
});
