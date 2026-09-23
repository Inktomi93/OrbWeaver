import { readVendorCssContract } from "../../../../tooling/src/verify/lib/vendor-css-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("declared vocabulary comes from CssVars values, deduplicated", () => {
  const contract = readVendorCssContract({
    packageVersion: "1.7.0",
    declarationFiles: [
      { path: "/installed/PopupCssVars.d.ts", text: 'export enum PopupCssVars { width = "--anchor-width", height = "--popup-height" }' },
      { path: "/installed/OtherCssVars.d.ts", text: 'export enum OtherCssVars { width = "--anchor-width" }' },
    ],
  });
  expect([...contract.declared]).toEqual(["--anchor-width", "--popup-height"]);
  expect(contract.version).toBe("1.7.0");
});

test("an empty installed surface reports an empty declared set and an undefined version", () => {
  const absent = readVendorCssContract({ declarationFiles: [] });
  expect(absent.declared.size).toBe(0);
  expect(absent.version).toBeUndefined();
});
