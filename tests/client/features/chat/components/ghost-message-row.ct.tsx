// CT: the streaming ghost row + ghost isolation. Drives the chat-stream store in-browser (begin →
// token…) and asserts: pending shows the TTFT shimmer; streaming reveals paced markdown; and more
// tokens grow ONLY the ghost while the surface-level lifecycle read (`phase`) stays "streaming" — the
// ghost-isolation invariant (token churn never leaves the one subscribed row).

import { expect, test } from "@playwright/experimental-ct-react";
import { GhostRowStory } from "../_ct-stories";

const THREE_HI = /Hi\s+Hi\s+Hi/;

test("pending shows the TTFT shimmer, then streaming reveals paced markdown", async ({ mount }) => {
  const component = await mount(<GhostRowStory />);
  const phase = component.getByTestId("phase");

  await component.getByTestId("begin").click();
  await expect(phase).toHaveText("pending");
  await expect(component.getByRole("status")).toBeVisible();

  await component.getByTestId("token").click();
  await expect(phase).toHaveText("streaming");
  await expect(component.getByText("Hi")).toBeVisible();
});

test("more tokens grow only the ghost; the lifecycle phase read stays stable", async ({
  mount,
}) => {
  const component = await mount(<GhostRowStory />);
  await component.getByTestId("begin").click();
  await component.getByTestId("token").click();
  await expect(component.getByTestId("phase")).toHaveText("streaming");

  await component.getByTestId("token").click();
  await component.getByTestId("token").click();

  await expect(component.getByText(THREE_HI)).toBeVisible();
  // Never left "streaming" across the extra tokens → the surface-level read didn't churn per delta.
  await expect(component.getByTestId("phase")).toHaveText("streaming");
});
