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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(trackCount(template)).toBe(4);
});

// #531: below the md step the arm is FIT-DRIVEN, not a second fixed grid. The old narrow arm was a
// `[1fr_auto]` 2×2 that spent an extra control row at every container under 768px — including containers
// where all four homes fit on one line. So the narrow assertion is about BEHAVIOUR (one line while the homes
// fit, wrap only when they cannot), not about a track count: a flex container has no `grid-template-columns`.
test("actionBar packs the four homes onto ONE line below the md container step while they fit", async ({ mount, page }) => {
  await mount(
    <Container style={{ width: 400 }}>
      <Grid cols="actionBar" data-testid="action-bar">
        <span style={{ width: 60 }}>chat</span>
        <span style={{ width: 60 }}>you</span>
        <span style={{ width: 60 }}>them</span>
        <span style={{ width: 60 }}>send</span>
      </Grid>
    </Container>,
  );
  const measured = await page.getByTestId("action-bar").evaluate((element) => ({
    display: getComputedStyle(element).display,
    rows: new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top))).size,
  }));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(measured.display).toBe("flex");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(measured.rows).toBe(1);
});

test("actionBar wraps below the md container step only when the homes no longer fit", async ({ mount, page }) => {
  await mount(
    <Container style={{ width: 400 }}>
      <Grid cols="actionBar" data-testid="action-bar">
        <span style={{ width: 150 }}>chat</span>
        <span style={{ width: 150 }}>you</span>
        <span style={{ width: 150 }}>them</span>
        <span style={{ width: 150 }}>send</span>
      </Grid>
    </Container>,
  );
  await expect
    .poll(
      async () =>
        await page
          .getByTestId("action-bar")
          .evaluate((element) => new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top))).size),
    )
    .toBeGreaterThan(1);
});
