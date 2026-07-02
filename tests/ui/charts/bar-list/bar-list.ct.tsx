// CT: <BarList> — horizontal ranked bars (ui-package-design §9 v1 corpus-viz set). Covers what's
// genuinely DOM-observable (heading, chart mount, empty state); the TOKENS-color/rank-order/
// valueFormatter wiring is asserted on the pure `buildBarListOption` builder in bar-list.test.ts —
// a mounted ECharts instance does not survive the Playwright component-test RPC boundary with its
// methods intact, so option-object assertions live in a plain unit test instead.
import { BarList } from "@orb/ui/bar-list";
import { expect, test } from "@playwright/experimental-ct-react";

const ITEMS = [
  { id: "a", label: "Handbook", value: 42 },
  { id: "b", label: "Onboarding guide", value: 30 },
  { id: "c", label: "FAQ", value: 12 },
];

test("renders the heading and a chart for a non-empty item list", async ({ mount }) => {
  const component = await mount(<BarList items={ITEMS} label="Top sources" />);
  await expect(component.getByText("Top sources")).toBeVisible();
  await expect(component.getByRole("img", { name: "Top sources" })).toBeVisible();
});

test("renders the empty state instead of a chart when items is empty", async ({ mount }) => {
  const component = await mount(<BarList items={[]} label="Top sources" />);
  await expect(component.getByText("Top sources")).toBeVisible();
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});
