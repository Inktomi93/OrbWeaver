// The rendered cohort fingerprint, driven through production readCohortRenders with a painted viewport screenshot. Colours
// are the seed themes' own tokens, so the subtle cases sit at the real token contrast the walk meets.
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import type { Rgb } from "@orb/kit/theme-derivation";
import { compositeSrgb } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/tooling";
import { readCohortRenders } from "@orb/tooling/ui-audit";
import { SEED_THEME_NAMES, SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import sharp from "sharp";
import { describe } from "vitest";
import type { CohortAnatomyInput, CohortMemberRender } from "../../../../tooling/src/ui-audit/contract/samples.ts";

const SHOT = { width: 320, height: 96 } as const;
const CHANNELS = 3;
const MEMBER = { width: 60, height: 40, pitch: 80, top: 24 } as const;

interface Paint {
  readonly fill: Rgb | null;
  readonly border: Rgb | null;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly state: CohortMemberRender["state"];
}

function colour(css: string, under: Rgb): Rgb {
  const parsed = parseCssColorToSrgb(css);
  if (parsed === null) {
    throw new Error(`seed colour ${css} does not parse`);
  }
  return compositeSrgb({ r: parsed.r, g: parsed.g, b: parsed.b }, parsed.alpha, under);
}

function themeColours(theme: (typeof SEED_THEME_NAMES)[number]): { background: Rgb; card: Rgb; border: Rgb; primary: Rgb; foreground: Rgb } {
  const vars: Readonly<Record<string, string>> = SEED_THEME_VALUE_SETS[theme].vars;
  const read = (name: string): string => {
    const value = vars[name];
    if (value === undefined) {
      throw new Error(`${theme} has no ${name}`);
    }
    return value;
  };
  const background = colour(read("--color-background"), { r: 0, g: 0, b: 0 });
  const card = colour(read("--color-card"), background);
  return {
    background,
    card,
    border: colour(read("--color-border"), card),
    primary: colour(read("--color-primary"), background),
    foreground: colour(read("--color-foreground"), background),
  };
}

// Chromium paints a box's background and border on its pixel-snapped rect: each edge rounds to the nearest device pixel.
function snapped(paint: Paint): { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } {
  return { left: Math.round(paint.x), top: Math.round(paint.y), right: Math.round(paint.x + MEMBER.width), bottom: Math.round(paint.y + MEMBER.height) };
}

function outsideRadius(px: number, py: number, paint: Paint): boolean {
  if (paint.radius === 0) {
    return false;
  }
  const box = snapped(paint);
  const cx = Math.min(Math.max(px + 0.5, box.left + paint.radius), box.right - paint.radius);
  const cy = Math.min(Math.max(py + 0.5, box.top + paint.radius), box.bottom - paint.radius);
  return Math.hypot(px + 0.5 - cx, py + 0.5 - cy) > paint.radius;
}

function pixelAt(px: number, py: number, under: Rgb, paints: readonly Paint[]): Rgb {
  for (const paint of paints) {
    const box = snapped(paint);
    if (px < box.left || px >= box.right || py < box.top || py >= box.bottom || outsideRadius(px, py, paint)) {
      continue;
    }
    const onEdge = px === box.left || px === box.right - 1 || py === box.top || py === box.bottom - 1;
    return (onEdge ? paint.border : null) ?? paint.fill ?? under;
  }
  return under;
}

async function encode(data: Buffer): Promise<Buffer> {
  return await sharp(data, { raw: { width: SHOT.width, height: SHOT.height, channels: CHANNELS } })
    .png()
    .toBuffer();
}

function paintPixel(data: Buffer, px: number, py: number, pixel: Rgb): void {
  const i = (py * SHOT.width + px) * CHANNELS;
  data[i] = pixel.r;
  data[i + 1] = pixel.g;
  data[i + 2] = pixel.b;
}

function shotPixels(backdropAt: (x: number) => Rgb, paints: readonly Paint[]): Buffer {
  const data = Buffer.alloc(SHOT.width * SHOT.height * CHANNELS);
  for (let py = 0; py < SHOT.height; py += 1) {
    for (let px = 0; px < SHOT.width; px += 1) {
      paintPixel(data, px, py, pixelAt(px, py, backdropAt(px), paints));
    }
  }
  return data;
}

const row = (fills: readonly (Partial<Paint> | null)[], base: Partial<Paint> = {}): Paint[] =>
  fills.map((overrides, index) => ({
    fill: null,
    border: null,
    x: 16 + index * MEMBER.pitch,
    y: MEMBER.top,
    radius: 0,
    state: "rest",
    ...base,
    ...overrides,
  }));

type RenderedCohort = Awaited<ReturnType<typeof readCohortRenders>>["cohorts"][number];

async function renderPixels(data: Buffer, paints: readonly Paint[]): Promise<RenderedCohort> {
  const png = await encode(data);
  const memberRenders = paints.map(
    (paint, index): CohortMemberRender => ({
      selector: `member-${String(index)}`,
      x: paint.x,
      y: paint.y,
      width: MEMBER.width,
      height: MEMBER.height,
      radiusPx: paint.radius,
      state: paint.state,
    }),
  );
  const anatomy: CohortAnatomyInput = {
    selector: "div.parent",
    cohortKey: "div|slot=probe",
    members: paints.length,
    minHeightPx: MEMBER.height,
    maxHeightPx: MEMBER.height,
    modeHeightPx: MEMBER.height,
    modeCount: paints.length,
    outlierCount: 0,
    outlierHeightPx: 0,
    outlierSelector: "",
    distinctHeights: 1,
    animating: false,
    memberRenders,
  };
  const result = await readCohortRenders({ screenshot: async () => png }, { cohortAnatomies: [anatomy] });
  const cohort = result.cohorts[0];
  if (cohort === undefined) {
    throw new Error("readCohortRenders returned no cohort");
  }
  return cohort;
}

const render = async (backdropAt: (x: number) => Rgb, paints: readonly Paint[]): Promise<RenderedCohort> =>
  await renderPixels(shotPixels(backdropAt, paints), paints);

// An outlier's `at` is the member path and its row, `member-2:3`.
const outlierMembers = (cohort: RenderedCohort): string[] => [
  ...new Set(cohort.comparisons.flatMap(({ outliers }) => outliers.map(({ at }) => at.slice(0, at.lastIndexOf(":"))))),
];

describe.each(SEED_THEME_NAMES)("rendered cohort fingerprint on the %s seed theme", (theme) => {
  const tokens = themeColours(theme);
  const flat = (): Rgb => tokens.background;

  test("identical card members at different subpixel offsets are one uniform cohort", async () => {
    const cohort = await render(
      flat,
      row([{ x: 16 }, { x: 96.5 }, { x: 176.25, y: MEMBER.top + 0.5 }], { fill: tokens.card, border: tokens.border, radius: 6 }),
    );
    expect(cohort.members.map(({ fingerprint }) => fingerprint.status)).toEqual(["measured", "measured", "measured"]);
    expect(cohort.verdict).toBe("uniform");
  });

  test("a member with a one-pixel border among unbordered siblings is divergent", async () => {
    const cohort = await render(flat, row([{}, {}, { border: tokens.border }], { fill: tokens.card }));
    expect(cohort.verdict).toBe("divergent");
    expect(outlierMembers(cohort)).toEqual(["member-2"]);
  });

  test("a card-filled member among transparent siblings is divergent", async () => {
    const cohort = await render(flat, row([{}, {}, { fill: tokens.card }]));
    expect(cohort.verdict).toBe("divergent");
    expect(outlierMembers(cohort)).toEqual(["member-2"]);
  });

  test("a primary-filled member among card siblings is divergent", async () => {
    const cohort = await render(flat, row([{}, {}, { fill: tokens.primary }], { fill: tokens.card }));
    expect(cohort.verdict).toBe("divergent");
    expect(outlierMembers(cohort)).toEqual(["member-2"]);
  });

  test("transparent members over a backdrop that changes between them stay one cohort", async () => {
    const stop = 16 + MEMBER.width + (MEMBER.pitch - MEMBER.width) / 2;
    const cohort = await render((x) => (x < stop ? tokens.background : tokens.primary), row([{}, {}, {}]));
    expect(cohort.verdict).toBe("uniform");
  });

  test("a member whose edge is not one colour is incomplete, never a match", async () => {
    const paints = row([{}, {}, {}], { fill: tokens.card });
    const data = shotPixels(flat, paints);
    const third = paints[2];
    if (third === undefined) {
      throw new Error("row has no third member");
    }
    // Member three's left half takes the foreground, so its edge band spans two colours.
    for (let py = third.y; py < third.y + MEMBER.height; py += 1) {
      for (let px = third.x; px < third.x + MEMBER.width / 2; px += 1) {
        paintPixel(data, px, py, tokens.foreground);
      }
    }
    const cohort = await renderPixels(data, paints);
    expect(cohort.members[2]?.fingerprint).toEqual({ status: "incomplete", reason: "edge band is not one colour" });
    expect(cohort.comparisons.find(({ column }) => column === "edge")?.total).toBe(2);
  });

  test("a member the census read as selected is incomplete and left out of the comparison", async () => {
    const cohort = await render(flat, row([{}, {}, { fill: tokens.primary, state: "selected" }], { fill: tokens.card }));
    expect(cohort.members[2]?.fingerprint).toEqual({ status: "incomplete", reason: "member paints its selected state, not the resting anatomy" });
    expect(cohort.verdict).toBe("uniform");
  });
});

test("a census without a cohort list is an error, not an empty surface", async () => {
  const result = await readCohortRenders({ screenshot: async () => Buffer.alloc(0) }, {});
  expect(result).toEqual({ cohorts: [], error: "the design census returned no cohort list" });
});
