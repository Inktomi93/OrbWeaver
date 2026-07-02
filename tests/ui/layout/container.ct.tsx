// <Container> CT — THE containment provider (UI-Arch §4). A dynamic `@container/<name>` class is
// invisible to Tailwind's scanner, and an `@min-[…]` child query would itself be a raw value — so
// containment is asserted the durable way: computed `container-type` / `container-name`.
import { Container } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("establishes inline-size containment", async ({ mount }) => {
  const component = await mount(
    <Container>
      <div>surface</div>
    </Container>,
  );
  const containerType = await component.evaluate((el) => getComputedStyle(el).containerType);
  expect(containerType).toBe("inline-size");
});

test("name lands as container-name via the style attr", async ({ mount }) => {
  const component = await mount(
    <Container name="panel">
      <div>surface</div>
    </Container>,
  );
  const containerName = await component.evaluate((el) => getComputedStyle(el).containerName);
  expect(containerName).toBe("panel");
});

test("size constrains width to the --container-cq-* token scale", async ({ mount }) => {
  const component = await mount(
    <Container size="sm">
      <div>surface</div>
    </Container>,
  );
  // --container-cq-sm = 24rem = 384px
  await expect(component).toHaveCSS("max-width", "384px");
});
