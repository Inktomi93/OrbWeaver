// CT: `<FaceStrip>` — the client-shared strip of clickable faces (list-pane-projection §11.2, D12), which
// the character library's favorites strip and the chats pane's Arm B strip both render.
//
// Pins what a portrait-only shortcut row can silently get wrong:
//   · each face is a REAL button with the full name as its accessible name (the portrait carries no text),
//     and the selected one announces `aria-current` — the ring is reinforcement, never the datum;
//   · the caption TRUNCATES instead of warping the strip's rhythm, and the full name survives in the name;
//   · an empty set renders NOTHING (a shortcut to nowhere is chrome, not an empty state);
//   · the face's own box meets the per-pointer touch floor even though `size="media"` is content-sized.

import { FaceStrip } from "@orb/client/components";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { FaceStripFoldHarness } from "./face-strip.fixtures.tsx";

const AZARAEL = { id: "char_azarael", name: "Azarael", avatarHash: null };
const SERA = { id: "char_sera", name: "Sera of the Long Winter Court", avatarHash: null };
const AVATAR_MD_PX = Number.parseFloat(TOKENS["spacing.avatar-md"].value) * 16;
/** WCAG 2.5.5's target floor — the law's coarse-pointer bar (D62 P1 / touch-target-floor.suite.ct.tsx). */
const WCAG_FLOOR = 44;

test("each face is a named button; the selected one announces aria-current", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[AZARAEL, SERA]} label="Recent characters" onSelect={(): void => undefined} selectedId={AZARAEL.id} />);

  const selected = component.getByRole("button", { name: "Open Azarael", exact: true });
  await expect(selected).toHaveAttribute("aria-current", "true");
  // The other face is present and NOT current — state is on exactly one.
  await expect(component.getByRole("button", { name: `Open ${SERA.name}`, exact: true })).not.toHaveAttribute("aria-current", "true");
  // The strip IS the mount root, so assert on it directly (a descendant query would never reach it).
  await expect(component).toHaveAttribute("role", "list");
  await expect(component).toHaveAttribute("aria-label", "Recent characters");
});

test("tapping a face fires onSelect with its id", async ({ mount }) => {
  let picked = "";
  const component = await mount(
    <FaceStrip
      items={[AZARAEL, SERA]}
      label="Recent characters"
      onSelect={(id): void => {
        picked = id;
      }}
      selectedId={null}
      verb="Show chats with"
    />,
  );

  await component.getByRole("button", { name: "Show chats with Azarael", exact: true }).click();
  expect(picked).toBe(AZARAEL.id);
});

// side-eye P2a: the caption used to be a FIXED `w-avatar-lg` box, so every name — including a short one the
// mock prints in full — was clipped to ~6 characters. The ceiling is a MAX now: short names take their own
// natural width and only a genuinely long one truncates.
test("a caption takes its NATURAL width; only a long name truncates, and the full name stays the accessible name", async ({ mount }) => {
  const component = await mount(
    <FaceStrip caption={true} items={[AZARAEL, SERA]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />,
  );

  const measure = (name: string): Promise<{ overflow: string; textOverflow: string; whiteSpace: string; width: number; scrollWidth: number }> =>
    component.getByText(name, { exact: true }).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        width: el.getBoundingClientRect().width,
        scrollWidth: el.scrollWidth,
      };
    });

  // "Azarael" fits — it is NOT clipped (the round-1 defect: rendered "Azarae…" in a 40px box).
  const short = await measure(AZARAEL.name);
  expect(Math.round(short.scrollWidth)).toBeLessThanOrEqual(Math.ceil(short.width));
  // The long one still truncates rather than warping the strip's rhythm.
  const long = await measure(SERA.name);
  // NATURAL, not fixed: the two captions differ in width because each takes its own content's. This
  // replaces a `> 40px` floor that silently encoded the caption's letter-spacing — the density pass moved
  // the caption onto the `gloss` VOICE, which drops the micro-caps `tracking` a lowercase name never
  // wanted, and the same un-clipped "Azarael" now measures ~36px (density-pass-spec.md §2.3).
  expect(short.width).not.toBe(long.width);
  expect(long.overflow).toBe("hidden");
  expect(long.textOverflow).toBe("ellipsis");
  expect(long.whiteSpace).toBe("nowrap");
  expect(long.scrollWidth).toBeGreaterThan(long.width);
  // Nothing is lost: the button still announces the whole name.
  await expect(component.getByRole("button", { name: `Open ${SERA.name}`, exact: true })).toBeVisible();
});

// side-eye P2b: a bare row of portraits reads as decoration. The kicker is the mock's group label — the
// only VISIBLE thing telling a cold user the strip is a control (the aria-label reaches SR users only).
test("a kicker prints a micro-caps group label above the faces (and is omitted by default)", async ({ mount }) => {
  const bare = await mount(<FaceStrip caption={true} items={[AZARAEL]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
  await expect(bare.getByText("Faces", { exact: true })).toHaveCount(0);
  await bare.unmount();

  const labelled = await mount(
    <FaceStrip caption={true} items={[AZARAEL]} kicker="Faces" label="Recent characters" onSelect={(): void => undefined} selectedId={null} />,
  );
  const kicker = labelled.getByText("Faces", { exact: true });
  await expect(kicker).toBeVisible();
  await expect(kicker).toHaveCSS("text-transform", "uppercase");
  // It labels the faces — above them in the reading order, not beside a face.
  const order = await labelled.evaluate((root) => {
    const nodes = [...root.querySelectorAll("*")];
    const at = (el: Element | null): number => (el === null ? -1 : nodes.indexOf(el));
    return { kicker: at(root.querySelector("p, span")), list: at(root.querySelector('[role="list"]')) };
  });
  expect(order.kicker).toBeLessThan(order.list);
});

// The FACE-VERB ambiguity (home side-eye): a clickable character face LAUNCHES a chat everywhere else in
// the app, and in this strip it FILTERS — one rail click apart, same picture. The selected face therefore
// paints as a STATE you are in, not as "the one you last touched": the caption joins the ring on the accent
// (the mock's `.f.on{color:primary}`), which is also the colour the "Filtered: X" chip repeats below it.
test("the SELECTED face tints its caption to the accent — the filter-state treatment, not just a ring", async ({ mount }) => {
  const component = await mount(
    <FaceStrip
      caption={true}
      items={[AZARAEL, SERA]}
      label="Recent characters"
      onSelect={(): void => undefined}
      selectedId={AZARAEL.id}
      verb="Show chats with"
    />,
  );
  // Against the RESOLVED token, never a literal — a retint of the theme must not red this test. A probe
  // span carries the var so the browser NORMALIZES it the same way it normalizes the caption's own `color`
  // (the raw custom-property text is `oklch(72% .175 52)`, the computed form `oklch(0.72 0.175 52)`).
  const resolve = async (token: string): Promise<string> =>
    await component.evaluate((el, name) => {
      const probe = el.ownerDocument.createElement("span");
      probe.style.color = `var(${name})`;
      el.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, token);
  const primary = await resolve("--color-primary");
  const muted = await resolve("--color-muted-foreground");
  expect(primary).not.toBe(muted);

  await expect(component.getByText(AZARAEL.name, { exact: true })).toHaveCSS("color", primary);
  await expect(component.getByText(SERA.name, { exact: true })).toHaveCSS("color", muted);
});

test("no caption by default (the favorites-strip posture: portraits only)", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[SERA]} label="Favorite characters" onSelect={(): void => undefined} selectedId={null} />);
  await expect(component.getByText(SERA.name, { exact: true })).toHaveCount(0);
});

test("an empty set renders NOTHING — never an empty shell", async ({ mount, page }) => {
  await mount(<FaceStrip items={[]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
  await expect(page.getByRole("list")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the face's hit box is the avatar token square — content-sized, not a collapsed control", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[AZARAEL]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
  const button = component.getByRole("button", { name: "Open Azarael", exact: true });
  const box = await button.boundingBox();
  // `size="media"` is content-sized, so the button IS its avatar child — never smaller than it (the F2 defect).
  expect(box?.width).toBeGreaterThanOrEqual(AVATAR_MD_PX);
  expect(box?.height).toBeGreaterThanOrEqual(AVATAR_MD_PX);
  // …and the MIN box is the control token, not the portrait: the face is a control, so it rides the same
  // per-pointer floor as its sibling icon buttons (side-eye P1-3), with the 32px avatar centered inside it.
  const controlMd = await button.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
  expect(box?.width).toBeGreaterThanOrEqual(controlMd);
  expect(box?.height).toBeGreaterThanOrEqual(controlMd);
});

// ── The FOLD (FACEFILT) ────────────────────────────────────────────────────────────────────────────
// A strip that scrolls sideways is a second thing to navigate (the owner's report: nine faces scrolling on
// a six-character library). With an `overflow` picker the strip fits its PANE instead — as many measured
// faces as the width holds, everyone else behind one tile. These pin the rules that survive every width.

const FACE_ROW = '[aria-label="Recent characters"]';
const OVERFLOW_TILE = "Filter by another character";
/** Every pane width a real LIST panel resolves to (`--dimension-panel` clamps 272px…416px, less the
 *  panel body's 8px inline padding either side) plus the margins around it — the fold's rules are
 *  properties of the strip, not of one lucky fixture width. */
const SWEEP_WIDTHS = [180, 200, 220, 240, 256, 272, 288, 304, 320, 344, 368, 400];

interface StripReadout {
  readonly clientWidth: number;
  readonly fits: boolean;
  readonly faces: number;
  readonly overhang: number;
  readonly tile: string | null;
}

test("the fold holds at EVERY pane width: one un-scrolled row, nothing clipped, and never a '+1 more' tile", async ({ mount }) => {
  const component = await mount(<FaceStripFoldHarness />);
  await expect(component.getByRole("button", { name: OVERFLOW_TILE, exact: true })).toBeVisible();

  const read = async (): Promise<StripReadout> =>
    await component.locator(FACE_ROW).evaluate((row) => {
      const box = row.getBoundingClientRect();
      const faces = [...row.querySelectorAll("[data-face-key]")];
      const tile = row.querySelector("[data-face-overflow]");
      return {
        clientWidth: Math.round(row.clientWidth),
        fits: Math.round(row.scrollWidth) <= Math.round(row.clientWidth),
        faces: faces.length,
        overhang: Math.max(-1, ...faces.map((face) => face.getBoundingClientRect().right - box.right)),
        tile: tile === null ? null : (tile.textContent ?? ""),
      };
    });

  for (const width of SWEEP_WIDTHS) {
    // The measuring host IS the mount root (a descendant query would never reach it — the same trap the
    // `role="list"` assertion above documents).
    // biome-ignore lint/performance/noAwaitInLoops: a width SWEEP is sequential by definition — each width must settle its fold before the next is applied; a parallel batch would race the ResizeObserver, not sweep.
    await component.evaluate((host, next) => {
      (host as HTMLElement).style.width = `${next}px`;
    }, width);
    // The fold is ResizeObserver-driven, so poll to SETTLED — a same-tick read is a false negative by
    // construction. A timeout here means the strip never fit, which is the defect itself.
    await expect
      .poll(
        async () => {
          const settled = await read();
          return { clientWidth: settled.clientWidth, fits: settled.fits };
        },
        { intervals: [10, 20, 50, 100] },
      )
      .toEqual({ clientWidth: width, fits: true });

    const settled = await read();
    // Fitting is not the same as CLIPPING: every rendered face's right edge is inside the row.
    expect(settled.overhang).toBeLessThanOrEqual(0);
    expect(settled.faces).toBeGreaterThan(0);
    // The tile costs exactly the slot of a face, so it never stands in for a single one: a "+1 more"
    // button IS the face it is hiding. The leftover-of-one takes the tile's slot instead.
    expect(settled.tile).not.toContain("+1");
  }
});

test("a face picked from the OVERFLOW picker is hoisted into the visible row — a pane is never scoped by an invisible face", async ({ mount }) => {
  const component = await mount(<FaceStripFoldHarness width={220} />);
  const tile = component.getByRole("button", { name: OVERFLOW_TILE, exact: true });
  await expect(tile).toBeVisible();

  // The LAST curated face is the one furthest beyond the fold — unreachable in the strip by construction.
  const foldedName = "Perrin Halloway 10";
  await expect(component.getByRole("button", { name: `Show chats with ${foldedName}`, exact: true })).toHaveCount(0);

  await tile.click();
  await component.page().getByRole("button", { name: foldedName, exact: true }).click();

  const face = component.getByRole("button", { name: `Show chats with ${foldedName}`, exact: true });
  await expect(face).toHaveAttribute("aria-current", "true");
  const placement = await component.locator(FACE_ROW).evaluate((row) => {
    const box = row.getBoundingClientRect();
    const current = row.querySelector('[aria-current="true"]')?.getBoundingClientRect();
    return current === undefined
      ? null
      : { fits: Math.round(row.scrollWidth) <= Math.round(row.clientWidth), left: current.left - box.left, right: current.right - box.right };
  });
  expect(placement?.left).toBeGreaterThanOrEqual(0);
  expect(placement?.right).toBeLessThanOrEqual(0);
  expect(placement?.fits).toBe(true);
});

test("a strip with NO overflow prop is untouched — it still scrolls, and grows no tile (the favorites-strip posture)", async ({ mount }) => {
  const component = await mount(<FaceStrip items={[AZARAEL, SERA]} label="Favorite characters" onSelect={(): void => undefined} selectedId={null} />);

  await expect(component.getByRole("button", { name: OVERFLOW_TILE, exact: true })).toHaveCount(0);
  await expect(component).toHaveCSS("overflow-x", "auto");
});

// The floor the law actually governs is the COARSE one (D62 P1): a 32px portrait was a 32px tap target on
// every touch device — under WCAG's 44px and under this app's own 48px coarse control box.
test.describe("coarse pointer — the face meets the touch floor", () => {
  test.use({ hasTouch: true });

  test("a face is at least the 44px WCAG floor, and in practice the 48px coarse control box", async ({ mount, page }) => {
    // ONESHOT-OK: a media-query match on a context flag set BEFORE the page opened — nothing async can
    // change it (the touch-target-floor suite's own R6 probe reads it the same way).
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<FaceStrip items={[AZARAEL]} label="Recent characters" onSelect={(): void => undefined} selectedId={null} />);
    const button = component.getByRole("button", { name: "Open Azarael", exact: true });
    const shortSide = async (): Promise<number> => {
      const box = await button.boundingBox();
      return Math.min(box?.width ?? 0, box?.height ?? 0);
    };
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(WCAG_FLOOR);
    // The box is the resolved TOKEN (48px at coarse), never hand math — and the avatar inside it is untouched.
    const controlMd = await button.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBe(controlMd);
    await expect
      .poll(() => component.locator('[data-slot="avatar-root"]').evaluate((el) => el.getBoundingClientRect().width), { intervals: [20, 50, 100] })
      .toBe(AVATAR_MD_PX);
  });

  // The overflow tile is the door to every face the fold hid — a door under the touch floor is the same
  // defect the faces themselves already fixed (side-eye P1-3), and it is the ONE control a coarse-pointer
  // user cannot work around by scrolling any more.
  test("the overflow tile rides the SAME coarse control box as the faces beside it", async ({ mount }) => {
    const component = await mount(<FaceStripFoldHarness width={240} />);
    const tile = component.getByRole("button", { name: OVERFLOW_TILE, exact: true });
    await expect(tile).toBeVisible();
    const controlMd = await tile.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
    const shortSide = async (): Promise<number> => {
      const box = await tile.boundingBox();
      return Math.min(box?.width ?? 0, box?.height ?? 0);
    };
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(WCAG_FLOOR);
    await expect.poll(shortSide, { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(controlMd);
  });
});
