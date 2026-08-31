import { classifyCascadeSource, REPOSITORY_CASCADE_SOURCES } from "../../../../tooling/src/snap/lib/cascade-source.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("cascade source ownership is closed over the sanctioned stylesheet homes", () => {
  const cases = [
    ["/packages/client/src/features/app-shell/surfaces/shell.css", "shell"],
    ["/packages/client/src/styles/globals.css", "client-global"],
    ["/packages/ui/src/styles/theme.css", "generated-theme"],
    ["/packages/ui/src/styles/tiers.css", "ui-tier"],
    ["/packages/ui/src/styles/globals.css", "ui-global"],
  ] as const;
  expect(
    cases.map(([sourceUrl]) => classifyCascadeSource({ styleType: "Regular", sourceUrl: `http://localhost:5173${sourceUrl}?v=1`, ownerCustomCss: false })),
  ).toEqual(cases.map(([, kind]) => kind));
  expect(REPOSITORY_CASCADE_SOURCES).toEqual(new Set(cases.map(([, kind]) => kind)));
});

test("dynamic, inline, and owner custom styles do not masquerade as repository sheets", () => {
  expect(classifyCascadeSource({ styleType: "Animation", sourceUrl: null, ownerCustomCss: false })).toBe("dynamic");
  expect(classifyCascadeSource({ styleType: "Transition", sourceUrl: null, ownerCustomCss: false })).toBe("dynamic");
  expect(classifyCascadeSource({ styleType: "Inline", sourceUrl: null, ownerCustomCss: false })).toBe("inline");
  expect(classifyCascadeSource({ styleType: "Regular", sourceUrl: null, ownerCustomCss: true })).toBe("owner-custom-css");
  expect(classifyCascadeSource({ styleType: "Regular", sourceUrl: "https://extension.invalid/injected.css", ownerCustomCss: false })).toBe("opaque");
});
