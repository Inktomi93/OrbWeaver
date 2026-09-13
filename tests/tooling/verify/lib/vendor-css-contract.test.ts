import { readVendorCssContract } from "../../../../tooling/src/verify/lib/vendor-css-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("vendor vocabulary comes from API table rows and CssVars values, not prose", () => {
  const contract = readVendorCssContract({
    mirrorDocuments: [
      { path: "docs/vendor/base-ui/INDEX.md", text: "# Base UI docs mirror — v1.7.0\n" },
      {
        path: "docs/vendor/base-ui/components/popup.md",
        text: "Prose mentions `--not-a-row`.\n| `--anchor-width` | length | width |\n| `--anchor-width` | length | duplicate |\n",
      },
    ],
    mirrorIndexText: "# Base UI docs mirror — v1.7.0\n",
    packageVersion: "1.7.0",
    declarationFiles: [{ path: "/installed/PopupCssVars.d.ts", text: 'export enum PopupCssVars { width = "--anchor-width", height = "--popup-height" }' }],
  });
  expect(contract.mirrorFiles).toBe(2);
  expect([...contract.documented]).toEqual(["--anchor-width"]);
  expect([...contract.declared]).toEqual(["--anchor-width", "--popup-height"]);
  expect(contract.version).toBe("1.7.0");
  expect(contract.mirrorVersion).toBe("1.7.0");
});

test("missing and mismatched version evidence remains visible to the health owner", () => {
  const absent = readVendorCssContract({ mirrorDocuments: [], mirrorIndexText: "", declarationFiles: [] });
  expect(absent).toMatchObject({ mirrorFiles: 0, version: undefined, mirrorVersion: undefined });
  expect(absent.documented.size).toBe(0);
  expect(absent.declared.size).toBe(0);
  const mismatch = readVendorCssContract({
    mirrorDocuments: [],
    mirrorIndexText: "# Base UI docs mirror — v1.7.0",
    declarationFiles: [],
    packageVersion: "2.0.0",
  });
  expect(mismatch.version).not.toBe(mismatch.mirrorVersion);
});
