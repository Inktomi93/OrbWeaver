// The token VAULT contract: official DTCG 2025.10 schemas first, Orb semantic checks second. These
// fixtures exercise the instrument in both directions; the real corpus assertion pins the shipped
// exact target surface and the deliberately bounded Hearth/Light/Mocha Resolver composition.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TokenContractTexts } from "@orb/ui/token-contract";
import {
  FORMAT_SCHEMA_SHA256,
  REQUIRED_SEED_VALUE_SET_PATHS,
  RESOLVER_SCHEMA_SHA256,
  readTokenContractTexts,
  validateTokenContractTexts,
} from "@orb/ui/token-contract";
import { describe } from "vitest";
import { gate as tokensContractGate } from "../../tooling/src/verify/gates/tokens-contract.ts";
import { verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const UI_ROOT = join(import.meta.dirname, "../../packages/ui");
const REPO_ROOT = join(import.meta.dirname, "../..");
const BASELINE_TARGETS = new Set(
  readFileSync(join(import.meta.dirname, "../../packages/ui/src/tokens/index.ts"), "utf8")
    .matchAll(/cssVar: "(--[a-z0-9-]+)"/gu)
    .map((match) => match[1] ?? ""),
);

const color = (l: number, c: number, h: number, alpha?: number): Record<string, unknown> => ({
  colorSpace: "oklch",
  components: [l, c, h],
  ...(alpha === undefined ? {} : { alpha }),
});

function validFixture(): TokenContractTexts {
  const official = readTokenContractTexts(UI_ROOT);
  const requiredColors = Object.fromEntries(REQUIRED_SEED_VALUE_SET_PATHS.map((path) => [path.slice("color.".length), { $value: color(0.35, 0.01, 60) }]));
  const base = {
    $extensions: {
      "orb.llm": { usage: ["Use semantic tokens; do not author palette literals in components."] },
      "orb.cssValues": {
        "--shadow-runtime": {
          value: "0 0 1rem var(--color-background)",
          placement: "theme",
          description: "A runtime custom-property shadow.",
          provenance: ["dimension.runtime-blur"],
        },
      },
    },
    color: {
      $type: "color",
      ...requiredColors,
      background: { $value: color(0.2, 0.01, 60) },
      foreground: { $value: color(0.95, 0.01, 60) },
      alias: { $value: "{color.foreground}" },
    },
    dimension: {
      $type: "dimension",
      gap: { $value: { value: 1, unit: "rem" } },
      "runtime-blur": { $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "input" } } },
      control: {
        $value: { value: 2.75, unit: "rem" },
        $extensions: { "orb.pointerFine": { value: 2, unit: "rem" } },
      },
    },
    duration: { $type: "duration", fast: { $value: { value: 130, unit: "ms" } } },
    font: { $type: "fontFamily", sans: { $value: ["Geist", "system-ui", "sans-serif"] } },
    number: {
      $type: "number",
      scalar: { $value: 1.4 },
      fill: { $value: 70, $extensions: { "orb.output": { kind: "percentage" } } },
    },
    shadow: {
      $type: "shadow",
      prose: {
        $value: {
          color: color(0, 0, 0, 0.45),
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 1, unit: "px" },
          blur: { value: 2, unit: "px" },
          spread: { value: 0, unit: "px" },
        },
      },
    },
    ease: { $type: "cubicBezier", out: { $value: [0.16, 1, 0.3, 1] } },
  };
  const valueSet = (value: Record<string, unknown>): Record<string, unknown> => ({
    color: {
      $type: "color",
      ...Object.fromEntries(REQUIRED_SEED_VALUE_SET_PATHS.map((path) => [path.slice("color.".length), { $value: value }])),
    },
  });
  const resolver = {
    version: "2025.10",
    sets: {
      base: {
        sources: [{ $ref: "./tokens.json" }],
        $extensions: { "orb.theme": { id: "hearth", colorScheme: "dark" } },
      },
      light: {
        sources: [{ $ref: "./themes/light.json" }],
        $extensions: { "orb.theme": { id: "light", colorScheme: "light" } },
      },
      mocha: {
        sources: [{ $ref: "./themes/mocha.json" }],
        $extensions: { "orb.theme": { id: "mocha", colorScheme: "dark" } },
      },
    },
    modifiers: {
      theme: {
        default: "hearth",
        contexts: { hearth: [], light: [{ $ref: "#/sets/light" }], mocha: [{ $ref: "#/sets/mocha" }] },
      },
    },
    resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }],
  };
  return {
    base: JSON.stringify(base),
    light: JSON.stringify(valueSet(color(0.98, 0.004, 75))),
    mocha: JSON.stringify(valueSet(color(0.15, 0.015, 250))),
    resolver: JSON.stringify(resolver),
    removed: JSON.stringify({ removed: [], removedTargets: [] }),
    formatSchema: official.formatSchema,
    resolverSchema: official.resolverSchema,
  };
}

function mutate(
  texts: TokenContractTexts,
  file: "base" | "light" | "mocha" | "resolver" | "removed",
  change: (value: Record<string, unknown>) => void,
): TokenContractTexts {
  const value = JSON.parse(texts[file]) as Record<string, unknown>;
  change(value);
  return { ...texts, [file]: JSON.stringify(value) };
}

function codes(texts: TokenContractTexts): Set<string> {
  return new Set(validateTokenContractTexts(texts).diagnostics.map((item) => item.code));
}

test("the official schemas are hash-pinned and a complete conformant fixture passes", () => {
  expect(FORMAT_SCHEMA_SHA256).toHaveLength(64);
  expect(RESOLVER_SCHEMA_SHA256).toHaveLength(64);
  expect(validateTokenContractTexts(validFixture()).diagnostics).toEqual([]);
});

test("the real vault is conformant and preserves the exact generated target surface", () => {
  const result = validateTokenContractTexts(readTokenContractTexts(UI_ROOT));
  const countTokens = (value: unknown): number => {
    if (typeof value !== "object" || value === null) {
      return 0;
    }
    const record = value as Record<string, unknown>;
    return "$value" in record ? 1 : Object.values(record).reduce<number>((total, child) => total + countTokens(child), 0);
  };
  const texts = readTokenContractTexts(UI_ROOT);
  const constituents = {
    base: countTokens(JSON.parse(texts.base)),
    light: countTokens(JSON.parse(texts.light)),
    mocha: countTokens(JSON.parse(texts.mocha)),
  };
  expect(result.diagnostics).toEqual([]);
  // SPELLED, NOT DERIVED, on purpose: the same-count controls below depend on the exact surface — a
  // same-count swap must be caught by the diagnostics, never by the count. Which means every re-pin owes
  // the whole delta, token by token, or it is a rubber stamp.
  //
  // 2026-09-02 re-pin, 190/62/42 → 197/64/42 (#1247). The `pnpm verify --push` tier caught this; a green
  // `pnpm check` never runs it, so SEVEN separate folds each landed a vault token and none re-paired here.
  // `git log facb808d0..HEAD -- packages/ui/src/tokens/{tokens.json,themes/*.json}` names five that moved a
  // count, and the delta is exactly theirs — nothing is unattributed:
  //   da3dcdfac (#1120)         base +1  dimension.device-pixel
  //   4fd9aad49 (#1145)         base +1  reading.measure-prose-ch
  //   aad98e225 (#1109, #1170)  base +2  spacing.switch-inset · spacing.switch-track-height
  //   27eb41557 (#1204)         base +1  dimension.shell-content-floor
  //   a743e4799                 base +2  color.selection-quiet · color.selection-quiet-foreground
  //                             light +2 the same pair's light arm
  // = base +7, light +2, mocha +0. `cssTargets` moves +7 with the seven new BASE tokens (each emits one
  // `cssVar`, all seven verified present in theme.css + tokens/index.ts); a theme ARM re-values a var that
  // already exists, so light's +2 adds no target. `scannedTokens` is the sum, 294 → 303.
  //
  // 2026-09-04 re-pin, 197/64/42 → 199/64/42 (1ffc3fa42, the density-selected fixed grid cell):
  //   base +2  width.cell-fixed · width.cell-fixed-compact
  // `cssTargets` moves +5, not +2: the two tokens emit their own `cssVar`s AND the vault's `orb.cssValues`
  // gained three runtime custom properties (--orb-grid-cell-fixed and its comfortable/compact density
  // aliases), each a target. 205 → 210; `scannedTokens` 303 → 305. Same-count controls below re-pinned.
  //
  // 2026-09-06 re-pin, 199/64/42 → 199/65/42. TWO landings, one of which had left this pin RED on main
  // before the #1684 lane touched it (measured: base 200 / light 65 / targets 211 / scanned 307):
  //   89514942d (#1641, D159)  base +1 · light +1  color.input-border — the opaque FORM-CONTROL edge, a
  //                            `light-dark()` token, so it constitutes in BOTH arms; `cssTargets` +1.
  //   this commit (#1684)      base −1             spacing.switch-thumb RETIRED (the Switch knob is
  //                            derived from track-height − 2×border − 2×inset at the site;
  //                            packages/ui/src/tokens/removed.json carries the row); `cssTargets` −1.
  // Net: base back to 199, light 65, `cssTargets` back to 210, `scannedTokens` 305 → 306.
  expect(constituents).toEqual({ base: 199, light: 65, mocha: 42 });
  expect(result.scannedTokens).toBe(constituents.base + constituents.light + constituents.mocha);
  expect(result.cssTargets.size).toBe(210);
  expect(result.cssTargets).toEqual(BASELINE_TARGETS);
  expect(result.themes).toEqual([
    { id: "hearth", colorScheme: "dark", source: "base" },
    { id: "light", colorScheme: "light", source: "light" },
    { id: "mocha", colorScheme: "dark", source: "mocha" },
  ]);
});

describe("official schema controls", () => {
  test("a changed official schema byte fails its pinned hash", () => {
    const fixture = validFixture();
    expect(codes({ ...fixture, formatSchema: `${fixture.formatSchema}\n` })).toContain("schema.hash");
  });

  test("unknown type, invalid unit, and wrong color component count are refused", () => {
    const unknown = mutate(validFixture(), "base", (base) => {
      (base["number"] as Record<string, unknown>)["$type"] = "string";
    });
    expect(codes(unknown)).toContain("token.type.unknown");

    const unit = mutate(validFixture(), "base", (base) => {
      (((base["dimension"] as Record<string, unknown>)["gap"] as Record<string, unknown>)["$value"] as Record<string, unknown>)["unit"] = "ch";
    });
    expect(codes(unit)).toContain("format.schema");

    const components = mutate(validFixture(), "base", (base) => {
      ((((base["color"] as Record<string, unknown>)["background"] as Record<string, unknown>)["$value"] as Record<string, unknown>)[
        "components"
      ] as unknown[]) = [0.2, 0.01];
    });
    expect(codes(components)).toContain("format.schema");
  });
});

describe("Orb semantic controls", () => {
  test("the fs-backed canonical gate proof stays green without weakening the real-worktree removal ratchet", () => {
    expect(verifyGateProofs([tokensContractGate])).toEqual([]);
  });

  test("comma-packed font members, alias cycles, and terminal type mismatches are refused", () => {
    const font = mutate(validFixture(), "base", (base) => {
      ((base["font"] as Record<string, unknown>)["sans"] as Record<string, unknown>)["$value"] = ["Geist, system-ui"];
    });
    expect(codes(font)).toContain("fontFamily.member");

    const cycle = mutate(validFixture(), "base", (base) => {
      const group = base["color"] as Record<string, unknown>;
      group["a"] = { $value: "{color.b}" };
      group["b"] = { $value: "{color.a}" };
    });
    expect(codes(cycle)).toContain("alias.cycle");

    const wrongType = mutate(validFixture(), "base", (base) => {
      ((base["color"] as Record<string, unknown>)["alias"] as Record<string, unknown>)["$value"] = "{number.scalar}";
    });
    expect(codes(wrongType)).toContain("alias.type");
  });

  test("closed extensions, duplicate outputs, missing var operands, and stale removed rows are refused", () => {
    const extension = mutate(validFixture(), "base", (base) => {
      (base["$extensions"] as Record<string, unknown>)["orb.unknown"] = {};
    });
    expect(codes(extension)).toContain("orb.extension.unknown");

    const duplicate = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, unknown>;
      css["--color-background"] = { value: "red", placement: "theme", description: "plant", provenance: ["color.background"] };
    });
    expect(codes(duplicate)).toContain("output.duplicate");

    const operand = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, unknown>;
      (css["--shadow-runtime"] as Record<string, unknown>)["value"] = "0 0 1rem var(--missing)";
    });
    expect(codes(operand)).toContain("orb.cssValues.var");

    const removed = mutate(validFixture(), "removed", (ledger) => {
      ledger["removed"] = [{ path: "color.background", reason: "plant" }];
    });
    expect(codes(removed)).toContain("removed.stale");
  });

  test("every runtime CSS output declares whether Tailwind or :root owns its placement", () => {
    const missing = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        const { placement: _, ...withoutPlacement } = runtime;
        css["--shadow-runtime"] = withoutPlacement;
      }
    });
    expect(codes(missing)).toContain("orb.cssValues");

    const invalid = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        runtime["placement"] = "utility";
      }
    });
    expect(codes(invalid)).toContain("orb.cssValues");

    const root = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        runtime["placement"] = "root";
      }
    });
    expect(validateTokenContractTexts(root).diagnostics).toEqual([]);
  });

  test("runtime CSS may derive a concrete output only from a portable DTCG alias", () => {
    const portable = mutate(validFixture(), "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        runtime["value"] = "{dimension.gap}";
        runtime["placement"] = "root";
      }
    });
    expect(validateTokenContractTexts(portable).diagnostics).toEqual([]);

    const missing = mutate(portable, "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        runtime["value"] = "{dimension.missing}";
      }
    });
    expect(codes(missing)).toContain("orb.cssValues.alias.missing");

    const inputOnly = mutate(portable, "base", (base) => {
      const css = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, Record<string, unknown>>;
      const runtime = css["--shadow-runtime"];
      if (runtime !== undefined) {
        runtime["value"] = "{dimension.runtime-blur}";
      }
    });
    expect(codes(inputOnly)).toContain("orb.cssValues.alias.nonportable");
  });

  test("the Git merge-base ratchet refuses a portable token deletion without a removed-ledger row", () => {
    const current = readTokenContractTexts(UI_ROOT);
    const deleted = mutate(current, "base", (base) => {
      (base["motion"] as Record<string, unknown>)["ambient"] = undefined;
    });
    const result = validateTokenContractTexts(deleted, REPO_ROOT);
    expect(result.diagnostics.map((item) => item.code)).toContain("removed.unrecorded");
    expect(result.diagnostics.map((item) => item.message)).toContain("portable token motion.ambient was removed without a ledger row");
  });

  test("the Git merge-base ratchet refuses a same-count runtime CSS target substitution", () => {
    const current = readTokenContractTexts(UI_ROOT);
    const swapped = mutate(current, "base", (base) => {
      const cssValues = (base["$extensions"] as Record<string, unknown>)["orb.cssValues"] as Record<string, unknown>;
      const portrait = cssValues["--aspect-portrait"];
      if (portrait === undefined) {
        throw new Error("fixture lost --aspect-portrait");
      }
      cssValues["--aspect-portrait"] = undefined;
      cssValues["--aspect-portrait-renamed"] = portrait;
    });
    const result = validateTokenContractTexts(swapped, REPO_ROOT);
    expect(result.cssTargets.size).toBe(210);
    expect(result.diagnostics.map((item) => item.code)).toContain("removed.target.unrecorded");

    const avatar = readFileSync(join(UI_ROOT, "src/primitives/avatar/variants.ts"), "utf8");
    const media = readFileSync(join(UI_ROOT, "src/primitives/media-tile-grid/variants.ts"), "utf8");
    expect(avatar).toContain("aspect-portrait");
    expect(media).toContain("aspect-portrait");
  });

  test("zero scanned tokens fails loud instead of reporting a blind clean", () => {
    const fixture = validFixture();
    const empty = { $extensions: { "orb.llm": { rules: "plant" }, "orb.cssValues": {} } };
    const texts = {
      ...fixture,
      base: JSON.stringify(empty),
      light: JSON.stringify({}),
      mocha: JSON.stringify({}),
    };
    expect(codes(texts)).toContain("token.scan.empty");
  });
});

describe("bounded Resolver controls", () => {
  test("a same-count seed member substitution is refused before generation", () => {
    const current = readTokenContractTexts(UI_ROOT);
    const swapped = mutate(current, "light", (light) => {
      const colors = light["color"] as Record<string, unknown>;
      const background = colors["background"];
      if (background === undefined) {
        throw new Error("fixture lost Light color.background");
      }
      colors["background"] = undefined;
      colors["sky-day"] = background;
    });
    const result = validateTokenContractTexts(swapped);
    expect(result.scannedTokens).toBe(306);
    expect(result.diagnostics.map((item) => item.code)).toContain("seed.members");
  });

  test("missing sets, mispaired seed metadata, extra modifiers, and reversed source order are refused", () => {
    const missing = mutate(validFixture(), "resolver", (resolver) => {
      (resolver["sets"] as Record<string, unknown>)["mocha"] = undefined;
    });
    expect(codes(missing)).toContain("resolver.sets");

    const mispaired = mutate(validFixture(), "resolver", (resolver) => {
      const light = (resolver["sets"] as Record<string, Record<string, unknown>>)["light"];
      const extensions = light?.["$extensions"] as Record<string, Record<string, unknown>>;
      (extensions["orb.theme"] ?? {})["id"] = "hearth";
    });
    expect(codes(mispaired)).toContain("resolver.theme");

    const modifier = mutate(validFixture(), "resolver", (resolver) => {
      (resolver["modifiers"] as Record<string, unknown>)["density"] = {
        default: "comfortable",
        contexts: { comfortable: [], compact: [] },
      };
    });
    expect(codes(modifier)).toContain("resolver.modifiers");

    const order = mutate(validFixture(), "resolver", (resolver) => {
      (resolver["resolutionOrder"] as unknown[]).reverse();
    });
    expect(codes(order)).toContain("resolver.order");
  });
});
