// A shelf face is named by what pressing it does plus the stamp it shows (WCAG 2.5.3); the pitch under it is its description.
import { expect, test } from "@playwright/test";
import type { ShelfFaceNameStory } from "./_shelf-face-name-stories.tsx";

const STORY = "tests/client/features/character/components/_shelf-face-name-stories/ShelfFaceNameStory";
const FACE = { name: "Sola Vance", stamp: "chatted 3h ago", caption: "A cartographer who lies about the coast." } as const;

for (const door of ["open", "resume"] as const) {
  test(`the ${door} door's name holds the name and stamp the face shows; the pitch is its description`, async ({ mount, page }) => {
    await mount<typeof ShelfFaceNameStory>(STORY, { door, face: FACE });
    const face = page.getByRole("listitem").getByRole("button");
    await expect(face).toBeVisible();
    await expect(face).toHaveAccessibleName(new RegExp(`${FACE.name}.*${FACE.stamp}`, "u"));
    await expect(face).toHaveAccessibleDescription(FACE.caption);
    await expect(face).not.toHaveAccessibleName(new RegExp(FACE.caption, "u"));
  });
}
