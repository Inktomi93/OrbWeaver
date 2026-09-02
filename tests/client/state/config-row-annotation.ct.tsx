// CT: the SETTING-ROW ANNOTATION seam (#932 E5 / #927) — the context a config `SettingRow` publishes and
// `useBoundField` consumes, so a section author never threads registry prose they do not own.
//
// Mounted as a CT rather than a node unit test because the seam's whole contract is a React read: what a
// consumer sees with a provider above it, without one, and inside a NESTED `null` re-publish (the shape a
// composite row uses so one address states its gloss exactly once). Its END-TO-END behaviour through the
// real config host — the gloss on screen, in `aria-describedby`, and the `i` as the teacher's door — is
// pinned in tests/client/components/setting-teach-row.ct.tsx; this file pins the seam itself.

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigRowAnnotationProbe } from "./config-row-annotation.fixtures.tsx";

test("a consumer with no provider reads null — the ordinary case for every bound field outside config", async ({ mount, page }) => {
  await mount(<ConfigRowAnnotationProbe />);
  await expect(page.getByTestId("annotation-outer")).toHaveText("none");
});

test("a consumer under a provider reads the row's gloss and hint, and its door fires", async ({ mount, page }) => {
  await mount(<ConfigRowAnnotationProbe provide={true} />);
  await expect(page.getByTestId("annotation-inner")).toHaveText("Tints quoted speech.|Affects quoted dialogue.");
  await page.getByRole("button", { name: "open the teacher" }).click();
  await expect(page.getByTestId("door-fired")).toHaveText("1");
});

test("a NESTED null re-publish blanks the read — one address states its gloss exactly once", async ({ mount, page }) => {
  await mount(<ConfigRowAnnotationProbe provide={true} />);
  // Same tree, same provider: the nested consumer sits inside the `null` re-publish a composite row wraps
  // its dependents in, so it must NOT inherit the master row's annotation.
  await expect(page.getByTestId("annotation-nested")).toHaveText("none");
});
