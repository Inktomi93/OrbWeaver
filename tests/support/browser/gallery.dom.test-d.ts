import type { PlaywrightTestArgs } from "@playwright/test";
import { expectTypeOf, test } from "vitest";
import type { ListPaneHeaderStory } from "../../client/components/_list-pane-header-stories.tsx";

declare const mount: PlaywrightTestArgs["mount"];
type HeaderMount = typeof mount<typeof ListPaneHeaderStory>;
type HeaderProps = NonNullable<Parameters<HeaderMount>[1]>;
type HeaderUpdateProps = NonNullable<Parameters<Awaited<ReturnType<HeaderMount>>["update"]>[0]>;

test("native gallery mounting and updates retain the actual story prop contract", () => {
  expectTypeOf<{ title: string; count: number; withBack: boolean }>().toExtend<HeaderProps>();
  expectTypeOf<{ title: number }>().not.toExtend<HeaderProps>();
  expectTypeOf<{ title: string; withBack: string }>().not.toExtend<HeaderProps>();
  expectTypeOf<{ title: string }>().toExtend<HeaderUpdateProps>();
  expectTypeOf<{ title: number }>().not.toExtend<HeaderUpdateProps>();
});
