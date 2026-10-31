import { CtIsolation } from "@orb/testkit/browser";
import { Avatar } from "@orb/ui/avatar";
import { BUTTON_BOX_OVERFLOW } from "@orb/ui/button/box-hit-area";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Circle, Icon } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import { PictureButton } from "@orb/ui/picture-button";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

type GlyphStep = keyof typeof BUTTON_BOX_OVERFLOW.glyphButton;
type InlineStep = keyof typeof BUTTON_BOX_OVERFLOW.inlineAction;

// Each inline step's type pair, read off the tokens so a probe paints exactly what the step should.
const INLINE_TYPE = {
  label: { size: "text.label", leading: "leading.label" },
  body: { size: "text.body", leading: "leading.body" },
} as const satisfies Record<InlineStep, { readonly size: keyof typeof TOKENS; readonly leading: keyof typeof TOKENS }>;

const cssVar = (token: keyof typeof TOKENS): string => `var(${TOKENS[token].cssVar})`;

/** Every glyph and inline step beside a probe sized from its own token, and a picture beside its portrait's twin. */
export function ButtonFamilyBoxesStory(): ReactElement {
  return (
    <CtIsolation subject="The button family's boxes" isolates="GlyphButton, InlineAction and PictureButton at each step, each beside its token probe">
      <div style={{ display: "flex", flexDirection: "column", gap: 48, padding: 48, alignItems: "flex-start" }}>
        {(Object.keys(BUTTON_BOX_OVERFLOW.glyphButton) as GlyphStep[]).map((glyph) => (
          <div key={glyph} style={{ display: "flex", gap: 48 }}>
            <GlyphButton aria-label={`Glyph ${glyph}`} glyph={glyph} variant="ghost">
              <Icon icon={Circle} size="xs" />
            </GlyphButton>
            <span
              data-probe={`glyph-${glyph}`}
              style={{ display: "block", inlineSize: cssVar(`size.glyph-${glyph}`), blockSize: cssVar(`size.glyph-${glyph}`) }}
            />
          </div>
        ))}
        {(Object.keys(BUTTON_BOX_OVERFLOW.inlineAction) as InlineStep[]).map((step) => (
          <div key={step} style={{ display: "flex", gap: 48 }}>
            <InlineAction step={step}>{`Inline ${step}`}</InlineAction>
            <span data-probe={`inline-${step}`} style={{ fontSize: cssVar(INLINE_TYPE[step].size), lineHeight: cssVar(INLINE_TYPE[step].leading) }}>
              probe
            </span>
          </div>
        ))}
        <span data-probe="touch-target" style={{ display: "block", blockSize: cssVar("size.touch-target") }} />
        <span data-probe="transparent" style={{ backgroundColor: "transparent" }} />
        <PictureButton aria-label="Bare picture">
          <Avatar size="hero">AB</Avatar>
        </PictureButton>
        <PictureButton aria-label="Ghost picture" variant="ghost">
          <Avatar size="hero">CD</Avatar>
        </PictureButton>
        <Avatar size="hero">EF</Avatar>
      </div>
    </CtIsolation>
  );
}

/** The states the shared core resolves for every member: busy, disabled and the focal action's CTA ring. */
export function ButtonFamilyStatesStory(): ReactElement {
  return (
    <CtIsolation subject="The button family's states" isolates="the busy, disabled and focal states each member takes from the shared core">
      <div style={{ display: "flex", gap: 48, padding: 48, alignItems: "center" }}>
        <GlyphButton aria-label="Focal glyph" glyph="lg">
          <Icon icon={Circle} size="xs" />
        </GlyphButton>
        <GlyphButton aria-label="Quiet glyph" glyph="lg" focal={false}>
          <Icon icon={Circle} size="xs" />
        </GlyphButton>
        <GlyphButton aria-label="Busy glyph" glyph="md" loading={true} variant="ghost">
          <Icon icon={Circle} size="xs" />
        </GlyphButton>
        <InlineAction disabled={true} step="label">
          Disabled inline
        </InlineAction>
        <InlineAction step="body" variant="link" tone="destructive">
          Destructive link
        </InlineAction>
      </div>
    </CtIsolation>
  );
}
