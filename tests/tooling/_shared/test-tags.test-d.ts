import type { TestTag } from "@orb/tooling/_shared/test-tags";
import type { TestOptions } from "vitest";
import { expectTypeOf, test } from "vitest";

const registered: TestOptions = { tags: "slow" };
// @ts-expect-error — runtime strictTags rejects this spelling, so authored tests must reject it too.
const typo = { tags: "slwo" } satisfies TestOptions;

test("registered Vitest tags are a closed type vocabulary", () => {
  expectTypeOf<TestTag>().toEqualTypeOf<"slow">();
  expectTypeOf(registered.tags).toEqualTypeOf<"slow" | "slow"[] | undefined>();
  expectTypeOf(typo).not.toExtend<TestOptions>();
});
