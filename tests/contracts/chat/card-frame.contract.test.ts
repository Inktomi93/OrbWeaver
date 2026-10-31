// The card-frame mint accepts only the closed style slice; an out-of-range root size parses and the frame clamp
// bounds it to the appearance font-scale range.
import type { CardFrameMintRequest } from "@orb/contracts/chat";
import { cardFrameMintRequestSchema } from "@orb/contracts/chat";
import { CARD_FRAME_STYLE_TOKEN, clampCardFrameStyleTokens } from "@orb/kit/card-frame";
import { FONT_SCALE_PERCENT } from "@orb/kit/font-scale";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds, IN_RANGE_CARD_FRAME_STYLE } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const BASE = { chatId: mintTypeId(ID_PREFIX.chat, createSeededIds().next), characterId: null, html: "<p>card</p>" } as const;

const mint = (styleTokens: unknown): ReturnType<typeof cardFrameMintRequestSchema.safeParse> => cardFrameMintRequestSchema.safeParse({ ...BASE, styleTokens });

test("the mint parses the closed style slice unchanged, whole or in part", () => {
  const parsed: CardFrameMintRequest = cardFrameMintRequestSchema.parse({ ...BASE, styleTokens: IN_RANGE_CARD_FRAME_STYLE });
  expect(parsed.styleTokens).toEqual(IN_RANGE_CARD_FRAME_STYLE);
  expect(mint({ [CARD_FRAME_STYLE_TOKEN.rootSize]: "90%" }).success).toBe(true);
  expect(mint({}).success).toBe(true);
});

test("the mint refuses a style key outside the slice, even one the frame clamp would drop", () => {
  expect(mint(IN_RANGE_CARD_FRAME_STYLE).success).toBe(true);
  expect(mint({ ...IN_RANGE_CARD_FRAME_STYLE, "--sandbox-accent": "12px" }).success).toBe(false);
  expect(mint({ ...IN_RANGE_CARD_FRAME_STYLE, "--anything": "1rem" }).success).toBe(false);
});

test("the mint refuses a style value that carries CSS, per token grammar", () => {
  for (const [name, value] of [
    [CARD_FRAME_STYLE_TOKEN.radius, "8px} </style><script>x()</script>"],
    [CARD_FRAME_STYLE_TOKEN.radius, "calc(1rem + 2px)"],
    [CARD_FRAME_STYLE_TOKEN.monoFamily, "Mono; } body { background: url(//evil.test) }"],
    [CARD_FRAME_STYLE_TOKEN.monoFamily, 'a"'],
    [CARD_FRAME_STYLE_TOKEN.monoFamily, "'Geist Mono\", monospace"],
    [CARD_FRAME_STYLE_TOKEN.rootSize, "125px"],
    [CARD_FRAME_STYLE_TOKEN.rootSize, "var(--x)"],
  ] as const) {
    expect(mint({ ...IN_RANGE_CARD_FRAME_STYLE, [name]: value }).success, `${name}: ${value}`).toBe(false);
  }
});

test("an out-of-range root size parses, and the frame clamp bounds it to the appearance range", () => {
  const { min, max } = FONT_SCALE_PERCENT;
  for (const [planted, bounded] of [
    ["400%", `${max}%`],
    ["10%", `${min}%`],
  ] as const) {
    const parsed = cardFrameMintRequestSchema.parse({ ...BASE, styleTokens: { [CARD_FRAME_STYLE_TOKEN.rootSize]: planted } });
    expect(clampCardFrameStyleTokens(parsed.styleTokens)).toEqual({ [CARD_FRAME_STYLE_TOKEN.rootSize]: bounded });
  }
});
