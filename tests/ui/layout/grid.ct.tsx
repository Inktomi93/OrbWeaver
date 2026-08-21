import { Container, Grid } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

function trackCount(template: string): number {
  return template.split(" ").filter(Boolean).length;
}

test("actionBar exposes four explicit tracks in a wide container", async ({ mount, page }) => {
  await mount(
    <Container style={{ width: 600 }}>
      <Grid cols="actionBar" data-testid="action-bar">
        <span>chat</span>
        <span>you</span>
        <span>them</span>
        <span>send</span>
      </Grid>
    </Container>,
  );
  const template = await page.getByTestId("action-bar").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(trackCount(template)).toBe(4);
});

test("actionBar exposes two explicit tracks below the md container step", async ({ mount, page }) => {
  await mount(
    <Container style={{ width: 400 }}>
      <Grid cols="actionBar" data-testid="action-bar">
        <span>chat</span>
        <span>you</span>
        <span>them</span>
        <span>send</span>
      </Grid>
    </Container>,
  );
  const template = await page.getByTestId("action-bar").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(trackCount(template)).toBe(2);
});
