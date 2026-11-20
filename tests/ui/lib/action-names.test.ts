// Each item-action grammar pinned by its literal sentence: every rendering feature and every locator calls the builder, so
// only an outcome spelled out here fails when a grammar is reworded or loses its subject.
import { expect, test } from "@orb/testkit/node";
import { defaultChoiceName, editActionName, moreActionsName, recentActivityName } from "@orb/ui/lib";

test("each grammar puts its subject after its own verb phrase", () => {
  expect([editActionName("Notes"), moreActionsName("Notes"), recentActivityName("Notes"), defaultChoiceName("mode default")]).toEqual([
    "Edit Notes",
    "More actions for Notes",
    "Recent activity for Notes",
    "Use the mode default",
  ]);
});
