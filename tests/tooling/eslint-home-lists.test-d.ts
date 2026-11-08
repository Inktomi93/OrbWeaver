// An exemption list names exact files: a glob, or a string whose value the checker cannot see, fails to compile.
import { expectTypeOf, test } from "vitest";
import { homeReasons, homes } from "../../tooling/src/eslint/syntax.ts";

declare const widened: string;
declare const widenedReasons: Record<string, string>;

test("a home list takes exact literal paths only", () => {
  expectTypeOf(homes("tooling/src/floor/host/platform.ts", "tests/support/iso/forged.ts")).toEqualTypeOf<string[]>();
  expectTypeOf(homeReasons({ ["packages/ui/src/primitives/tabs/tabs.tsx"]: "a reason" })).toEqualTypeOf<{
    readonly ["packages/ui/src/primitives/tabs/tabs.tsx"]: "a reason";
  }>();

  // @ts-expect-error -- a glob exempts every file it later matches.
  homes("tests/support/**/*.ts");
  // @ts-expect-error -- a widened string may hold a glob, and the checker cannot see its value.
  homes(widened);
  // @ts-expect-error -- one widened member is enough to widen the list.
  homes("tests/support/iso/forged.ts", widened);
  // @ts-expect-error -- a glob key exempts every file it later matches.
  homeReasons({ ["packages/ui/src/**"]: "a reason" });
  // @ts-expect-error -- a widened key set may hold a glob.
  homeReasons(widenedReasons);
});
