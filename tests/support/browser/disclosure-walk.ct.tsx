// The shared walkers open every closed disclosure and details element under a scope, checkpoint each body, then restore.
import { expect, test } from "@playwright/test";
import type { DisclosureWalkHooks } from "./disclosure-walk.ts";
import { walkDisclosures } from "./disclosure-walk.ts";

const ORIGIN = "http://disclosure-walk.test";
const PAGE = `
<section id="scope">
  <div data-slot="collapsible-root">
    <button data-slot="collapsible-trigger" aria-expanded="false" aria-controls="outer" onclick="toggle(this)">Outer</button>
    <div id="outer" hidden>outer body
      <details><summary>Inner details</summary>inner body</details>
    </div>
  </div>
  <details id="plain"><summary>Plain details</summary>plain body</details>
</section>
<script>
  function toggle(button) {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    document.getElementById(button.getAttribute("aria-controls")).hidden = open;
  }
</script>`;

test("walkDisclosures opens each disclosure and details, checkpoints their bodies, then restores the scope", async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto(ORIGIN);
  const checkpoints: string[] = [];
  const records: string[] = [];
  const hooks: DisclosureWalkHooks = {
    limit: 10,
    depthLimit: 4,
    completed: "visited",
    id: (path, kind, index) => `${path}/${kind}-${String(index)}`,
    expect: () => undefined,
    action: async (_id, step) => {
      await step.action();
      await step.ready();
    },
    checkpoint: (id) => {
      checkpoints.push(id);
      return Promise.resolve();
    },
    record: (id, disposition) => {
      records.push(`${id}:${disposition}`);
    },
    ready: async (body) => {
      await expect(body).toBeVisible();
    },
    summary: (path) => ({ disclosures: `${path}/disclosures`, nestedDetails: `${path}/nested-details` }),
  };
  await walkDisclosures(page.locator("#scope"), "scope", hooks);
  expect(checkpoints).toEqual(["scope/disclosure-0", "scope/disclosure-0/details-0", "scope/details-1"]);
  expect(records).toEqual(["scope/disclosures:visited"]);
  await expect(page.locator("#outer")).toBeHidden();
  await expect(page.locator("#plain")).not.toHaveAttribute("open", /.*/u);
});
