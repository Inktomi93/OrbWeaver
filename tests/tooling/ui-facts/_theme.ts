import { plantFile } from "@orb/testkit/tooling";

/** Plant the theme stylesheet and the token document the census reads its scope table from: `purposes` maps a custom property (without `--`) to the one purpose it serves. */
export function plantTheme(root: string, theme: string, purposes: Readonly<Record<string, string>> = {}): void {
  const tokens = Object.entries(purposes).map(([name, purpose]) => [name, { $value: "0", $extensions: { "orb.purpose": purpose } }] as const);
  plantFile(root, "packages/ui/src/styles/theme.css", theme);
  plantFile(root, "packages/ui/src/tokens/tokens.json", JSON.stringify({ ...Object.fromEntries(tokens), $extensions: { "orb.cssValues": {} } }));
}
