// The tier map keys on slots the @ui primitives emit: no @client file stamps a mapped slot, and no mapped slot goes unemitted.
// The slot vocabulary is read from tiers.css itself, so this check can never police a stale copy of the map.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "../../..");
const TIERS = "packages/ui/src/styles/tiers.css";
const UI_SOURCE_ROOT = "packages/ui/src/";
const SOURCE_ROOTS = [UI_SOURCE_ROOT, "packages/client/src/"] as const;
const SLOT_ATTRIBUTE = "data-slot";
const COMMENT_RE = /\/\*[\s\S]*?\*\//gu;
const SLOT_HOOK_RE = /\[data-slot=(?:"([^"]*)"|'([^']*)'|([^\]\s"']+))\]/gu;
const MAPPED_CARD_ROOT = '[data-surface-tier] [data-slot="card-root"] {\n  padding: var(--spacing-row);\n}\n';
const CARD_PRIMITIVE = "packages/ui/src/primitives/card/card.tsx";
const CARD_EMITTER = 'export const Card = (): unknown => <div data-slot="card-root" />;\n';
const ROGUE_FEATURE = "packages/client/src/features/x/rogue-slot.tsx";
const ROGUE_STAMP = 'export const G = <div data-slot="card-root" />;\n';

// The slot names the tier map keys on. Comments are blanked first, so prose that quotes a hook maps nothing.
function mappedSlots(tiersCss: string): readonly string[] {
  const names = [...tiersCss.replace(COMMENT_RE, "").matchAll(SLOT_HOOK_RE)].map(([, double, single, bare]) => double ?? single ?? bare ?? "");
  return [...new Set(names)];
}

// Every `data-slot="literal"` JSX attribute in one .tsx file.
function slotStamps(path: string, text: string): readonly string[] {
  if (!text.includes(SLOT_ATTRIBUTE)) {
    return [];
  }
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === SLOT_ATTRIBUTE &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer)
    ) {
      values.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX));
  return values;
}

// A stamp under @ui emits its slot; a stamp anywhere else consumes a name it does not own.
function slotMapFindings(tiersCss: string, sources: Readonly<Record<string, string>>): readonly string[] {
  const mapped = mappedSlots(tiersCss);
  const emitted = new Set<string>();
  const found: string[] = [];
  for (const [path, text] of Object.entries(sources)) {
    const stamps = slotStamps(path, text);
    if (path.startsWith(UI_SOURCE_ROOT)) {
      for (const stamp of stamps) {
        emitted.add(stamp);
      }
    } else {
      found.push(
        ...stamps
          .filter((stamp) => mapped.includes(stamp))
          .map((stamp) => `ROGUE STAMP: ${SLOT_ATTRIBUTE}="${stamp}" is mapped by ${TIERS} but stamped at ${path}, outside ${UI_SOURCE_ROOT}`),
      );
    }
  }
  found.push(
    ...mapped
      .filter((slot) => !emitted.has(slot))
      .map((slot) => `MAPPED-BUT-DEAD: ${TIERS} maps [${SLOT_ATTRIBUTE}="${slot}"] but no file under ${UI_SOURCE_ROOT} emits that slot`),
  );
  return found;
}

// The tier sheet's text. A missing sheet throws, so an absent map can never read as an empty one.
function readTiers(root: string): string {
  return readFileSync(join(root, TIERS), "utf8");
}

function readSources(root: string): Readonly<Record<string, string>> {
  const paths = readAuthoredRepositoryInventory(root).paths.filter((path) => path.endsWith(".tsx") && SOURCE_ROOTS.some((prefix) => path.startsWith(prefix)));
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
}

test("every tier-mapped slot is emitted by a @ui primitive and no @client file stamps one", () => {
  const tiersCss = readTiers(ROOT);
  const sources = readSources(ROOT);
  expect(mappedSlots(tiersCss).length, "the tier map names at least one slot").toBeGreaterThan(0);
  expect(Object.keys(sources).filter((path) => path.startsWith(UI_SOURCE_ROOT)).length, "the @ui source population is non-empty").toBeGreaterThan(0);
  expect(slotMapFindings(tiersCss, sources)).toEqual([]);
});

test("a feature stamping a mapped slot is a rogue stamp, and only that arm fires when @ui emits the slot", () => {
  const found = slotMapFindings(MAPPED_CARD_ROOT, { [CARD_PRIMITIVE]: CARD_EMITTER, [ROGUE_FEATURE]: ROGUE_STAMP });
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("ROGUE STAMP");
});

test("a mapped slot no @ui file emits is dead, and a commented-out mapping is not a mapping", () => {
  const tiersCss = `/* [data-slot="card-root"] in a comment is NOT a mapping */\n[data-surface-tier] [data-slot="ghost-slot"] {\n  padding: var(--spacing-row);\n}\n`;
  const found = slotMapFindings(tiersCss, { [CARD_PRIMITIVE]: CARD_EMITTER });
  expect(found).toHaveLength(1);
  expect(found[0]).toContain('MAPPED-BUT-DEAD: packages/ui/src/styles/tiers.css maps [data-slot="ghost-slot"]');
});

test("a feature stamp is not an emitter, so the same fixture fires both arms", () => {
  const found = slotMapFindings(MAPPED_CARD_ROOT, { [ROGUE_FEATURE]: ROGUE_STAMP });
  expect(found).toHaveLength(2);
  expect(found.filter((finding) => finding.startsWith("MAPPED-BUT-DEAD"))).toHaveLength(1);
});

test("an emitted mapped slot and a feature's own unmapped slot accuse nothing, nor does an empty map", () => {
  expect(
    slotMapFindings(MAPPED_CARD_ROOT, {
      [CARD_PRIMITIVE]: CARD_EMITTER,
      "packages/client/src/features/x/uses-card.tsx": 'export const G = <div data-slot="feature-own-slot" />;\n',
    }),
  ).toEqual([]);
  expect(
    slotMapFindings("[data-surface-tier] {}\n", { "packages/client/src/features/x/probe.tsx": 'export const G = <div data-slot="anything" />;\n' }),
  ).toEqual([]);
});

test("an absent tier sheet refuses instead of reading as an empty map that acquits every stamp", () => {
  expect(() => readTiers(join(ROOT, "tests"))).toThrow("ENOENT");
});
