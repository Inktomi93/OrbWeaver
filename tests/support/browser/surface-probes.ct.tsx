// The raw detectors are tested on planted markup inside their owning testkit, not exposed as product audit shortcuts.
import { expect, test } from "@playwright/test";
import { nameQualityFindings, productNameFindings } from "./accessible-names.ts";
import { densityFindings } from "./density-census.ts";
import { formIdentityFindings } from "./form-identity.ts";

test.describe("name-quality detector controls", () => {
  test("an unnamed button, a duplicate landmark, an unnamed form and a label missing from its name each fail", async ({ page }) => {
    await page.setContent(
      '<nav aria-label="Same"><a href="/a">A</a></nav><nav aria-label="Same"><a href="/b">B</a></nav>' +
        '<button type="button"></button><form><input aria-label="Field" name="field"></form>' +
        '<button type="button" aria-label="Open">Jump</button>',
    );
    const rules = new Set((await nameQualityFindings(page)).map((finding) => finding.rule));
    expect([...rules].sort()).toEqual(["duplicate-landmark", "label-not-in-name", "nameless-control", "unnamed-landmark"]);
  });

  test("a duplicate name is the product's unless the rows repeat the same record", async ({ page }) => {
    await page.setContent(
      '<div><span>Notes</span><button type="button">Edit Notes</button></div><div><span>Notes</span><button type="button">Edit Notes</button></div>',
    );
    const reported = (await productNameFindings(page)).filter((finding) => finding.rule === "ambiguous-duplicate");
    expect(reported.map((finding) => finding.subject)).toEqual(["Edit Notes"]);

    await page.setContent(
      '<ul><li><span>Your chat is now hosted</span><button type="button">Dismiss: Your chat is now hosted</button></li>' +
        '<li><span>Your chat is now hosted</span><button type="button">Dismiss: Your chat is now hosted</button></li></ul>',
    );
    expect(await productNameFindings(page)).toEqual([]);
    expect((await nameQualityFindings(page)).map((finding) => finding.rule)).toEqual(["ambiguous-duplicate"]);
  });

  test("clean markup reports nothing", async ({ page }) => {
    await page.setContent(
      '<nav aria-label="Primary"><a href="/a">A</a></nav><nav aria-label="Secondary"><a href="/b">B</a></nav>' +
        '<button type="button" aria-label="Save">Save</button><form aria-label="Sign in"><input aria-label="Handle" name="handle"></form>',
    );
    expect(await nameQualityFindings(page)).toEqual([]);
    // The probe reads this page: the same call reports a defect planted into it.
    await page.setContent('<button type="button"></button>');
    expect((await nameQualityFindings(page)).map((finding) => finding.rule)).toEqual(["nameless-control"]);
  });
});

test.describe("form-identity detector controls", () => {
  test("a field with no id or name, and a field with no label, each fail", async ({ page }) => {
    await page.setContent('<label>Named by its label<input></label><input id="bare" name="bare">');
    const findings = await formIdentityFindings(page);
    expect(findings.map((finding) => finding.rule).sort()).toEqual(["no-id-or-name", "no-label"]);
  });

  test("a labelled field with an id and a name reports nothing", async ({ page }) => {
    await page.setContent('<label for="handle">Handle</label><input id="handle" name="handle">');
    expect(await formIdentityFindings(page)).toEqual([]);
    // The probe reads this page: the same call reports a defect planted into it.
    await page.setContent('<input id="bare" name="bare">');
    expect((await formIdentityFindings(page)).map((finding) => finding.rule)).toEqual(["no-label"]);
  });
});

test.describe("density detector controls", () => {
  test("a second primary control in one region, a same-tier Surface and a boxed card in a boxed card each fail", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button><button data-slot="button" data-cta>Send</button></aside>' +
        '<section data-surface-tier="form"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="${box}">inner</div></div>`,
    );
    expect((await densityFindings(page)).map((finding) => finding.rule).toSorted()).toEqual(["nested-box", "same-tier-surface", "second-primary"]);
  });

  test("one primary per region, a different tier inside a tier and an unboxed well in a card all pass", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button></aside>' +
        '<main class="shell-content"><button data-slot="button" data-cta>Send</button><button data-slot="button" data-cta disabled>Off</button></main>' +
        '<section data-surface-tier="instrument"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="background:#ddd;border-radius:6px">well</div></div>`,
    );
    expect(await densityFindings(page)).toEqual([]);
    // The census reads this page: the same call reports a defect planted into it.
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button><button data-slot="button" data-cta>Send</button></aside>',
    );
    expect((await densityFindings(page)).map((finding) => finding.rule)).toEqual(["second-primary"]);
  });
});
