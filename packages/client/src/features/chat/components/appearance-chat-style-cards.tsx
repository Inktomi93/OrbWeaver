// Decorative skeleton diagrams of the anatomy MESSAGE_ROW_SKINS renders, not miniature transcripts.
// Current-color ink follows the viewer's palette; readable names and descriptions remain outside the art.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";

type ChatStyle = AppearanceSettings["chatStyle"];
const STYLE_OPTIONS = CHAT_STYLE_ITEMS as readonly { readonly value: string; readonly label: string; readonly description?: string }[];
function optionFor(value: string): { readonly label: string; readonly description?: string } {
  return STYLE_OPTIONS.find((option) => option.value === value) ?? { label: value };
}

type PreviewRole = Exclude<MessageRole, "system">;
const PROSE_GEOMETRY = { step: 17, middleWidth: 0.8, tailWidth: 0.6 };
const AVATAR_GEOMETRY = { headOffset: 3, shoulderRadius: 7 };
const PORTRAIT_GEOMETRY = { headY: 0.32, headRadius: 0.18, bodyX: 0.2, bodyY: 0.55, bodyWidth: 0.6, bodyHeight: 0.35, rounding: 0.25 };

function Speaker({ speaker, children }: { readonly speaker: PreviewRole; readonly children: ReactNode }): ReactElement {
  return (
    <g data-role={speaker} data-slot="chat-style-diagram-message">
      {children}
    </g>
  );
}

function Header({ x, y }: { readonly x: number; readonly y: number }): ReactElement {
  return <rect data-slot="chat-style-header" x={x} y={y} width={48} height={7} rx={3.5} fill="currentColor" opacity={0.8} />;
}

function Prose({
  x,
  y,
  width,
  short = false,
  single = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly short?: boolean;
  readonly single?: boolean;
}): ReactElement {
  return (
    <g data-slot="chat-style-prose" fill="currentColor" opacity={0.5}>
      <rect x={x} y={y} width={width} height={8} rx={4} />
      {single ? null : <rect x={x} y={y + PROSE_GEOMETRY.step} width={width * PROSE_GEOMETRY.middleWidth} height={8} rx={4} />}
      {short ? null : <rect x={x} y={y + 2 * PROSE_GEOMETRY.step} width={width * PROSE_GEOMETRY.tailWidth} height={8} rx={4} />}
    </g>
  );
}

function Avatar({ x, y }: { readonly x: number; readonly y: number }): ReactElement {
  return (
    <g data-slot="chat-style-avatar" fill="currentColor">
      <circle cx={x} cy={y} r={12} opacity={0.2} />
      <circle cx={x} cy={y - AVATAR_GEOMETRY.headOffset} r={4} opacity={0.7} />
      <path
        d={`M ${x - AVATAR_GEOMETRY.shoulderRadius} ${y + AVATAR_GEOMETRY.shoulderRadius} a ${AVATAR_GEOMETRY.shoulderRadius} ${AVATAR_GEOMETRY.shoulderRadius} 0 0 1 ${2 * AVATAR_GEOMETRY.shoulderRadius} 0`}
        opacity={0.7}
      />
    </g>
  );
}

function Bubble({ x, y, width, height }: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): ReactElement {
  return (
    <rect
      data-slot="chat-style-bubble"
      x={x}
      y={y}
      width={width}
      height={height}
      rx={10}
      fill="currentColor"
      fillOpacity={0.12}
      stroke="currentColor"
      strokeOpacity={0.35}
    />
  );
}

function Portrait({ x, y, width, height }: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): ReactElement {
  return (
    <g data-slot="chat-style-portrait" fill="currentColor">
      <rect x={x} y={y} width={width} height={height} rx={8} opacity={0.2} />
      <circle cx={x + width / 2} cy={y + height * PORTRAIT_GEOMETRY.headY} r={width * PORTRAIT_GEOMETRY.headRadius} opacity={0.7} />
      <rect
        x={x + width * PORTRAIT_GEOMETRY.bodyX}
        y={y + height * PORTRAIT_GEOMETRY.bodyY}
        width={width * PORTRAIT_GEOMETRY.bodyWidth}
        height={height * PORTRAIT_GEOMETRY.bodyHeight}
        rx={width * PORTRAIT_GEOMETRY.rounding}
        opacity={0.7}
      />
    </g>
  );
}

const STYLE_DRAWINGS: Record<ChatStyle, ReactElement> = {
  bubble: (
    <>
      <Speaker speaker="user">
        <Bubble x={144} y={34} width={220} height={86} />
        <Avatar x={384} y={56} />
        <Header x={300} y={49} />
        <Prose x={160} y={72} width={172} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Bubble x={44} y={156} width={308} height={112} />
        <Avatar x={24} y={178} />
        <Header x={60} y={171} />
        <Prose x={60} y={195} width={260} />
      </Speaker>
    </>
  ),
  flat: (
    <>
      <Speaker speaker="user">
        <Avatar x={384} y={56} />
        <Header x={300} y={49} />
        <Prose x={160} y={72} width={200} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Avatar x={24} y={178} />
        <Header x={56} y={171} />
        <Prose x={56} y={195} width={304} />
      </Speaker>
    </>
  ),
  document: (
    <>
      <Speaker speaker="user">
        <Avatar x={352} y={56} />
        <Header x={272} y={49} />
        <Prose x={104} y={72} width={220} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Avatar x={76} y={178} />
        <Header x={104} y={171} />
        <Prose x={104} y={195} width={220} />
      </Speaker>
    </>
  ),
  echo: (
    <>
      <Speaker speaker="user">
        <Bubble x={144} y={34} width={220} height={86} />
        <Portrait x={144} y={34} width={60} height={86} />
        <Avatar x={384} y={56} />
        <Header x={300} y={49} />
        <Prose x={216} y={72} width={132} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Bubble x={44} y={156} width={308} height={112} />
        <Portrait x={276} y={156} width={76} height={112} />
        <Avatar x={24} y={178} />
        <Header x={60} y={171} />
        <Prose x={60} y={195} width={196} />
      </Speaker>
    </>
  ),
  whisper: (
    <>
      <Speaker speaker="user">
        <Bubble x={144} y={22} width={220} height={86} />
        <Avatar x={384} y={44} />
        <Header x={300} y={37} />
        <Prose x={160} y={60} width={172} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Bubble x={44} y={128} width={308} height={156} />
        <Avatar x={24} y={150} />
        <g data-slot="chat-style-banner" fill="currentColor">
          <rect x={44} y={128} width={308} height={62} rx={10} opacity={0.2} />
          <circle cx={198} cy={150} r={9} opacity={0.7} />
          <rect x={180} y={164} width={36} height={18} rx={9} opacity={0.7} />
        </g>
        <Header x={60} y={202} />
        <Prose x={60} y={224} width={260} />
      </Speaker>
    </>
  ),
  hush: (
    <>
      <Speaker speaker="user">
        <rect data-slot="chat-style-stripe" x={144} y={34} width={4} height={86} fill="currentColor" opacity={0.8} />
        <Avatar x={384} y={56} />
        <Header x={300} y={49} />
        <Prose x={164} y={72} width={196} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <rect data-slot="chat-style-stripe" x={44} y={156} width={4} height={112} fill="currentColor" opacity={0.8} />
        <Avatar x={24} y={178} />
        <Header x={64} y={171} />
        <Prose x={64} y={195} width={296} />
      </Speaker>
    </>
  ),
  ripple: (
    <>
      <Speaker speaker="user">
        <Bubble x={100} y={20} width={264} height={116} />
        <Portrait x={300} y={20} width={64} height={116} />
        <Header x={236} y={36} />
        <Prose x={116} y={60} width={168} short={true} />
      </Speaker>
      <Speaker speaker="assistant">
        <Bubble x={36} y={158} width={308} height={116} />
        <Portrait x={36} y={158} width={72} height={116} />
        <Header x={124} y={174} />
        <Prose x={124} y={198} width={204} />
      </Speaker>
    </>
  ),
  tide: (
    <>
      <Speaker speaker="user">
        <Avatar x={384} y={40} />
        <Header x={164} y={32} />
        <g data-slot="chat-style-train">
          <Bubble x={164} y={52} width={132} height={34} />
          <Bubble x={164} y={96} width={196} height={34} />
          <Prose x={178} y={65} width={100} short={true} single={true} />
          <Prose x={178} y={109} width={160} short={true} single={true} />
        </g>
      </Speaker>
      <Speaker speaker="assistant">
        <Avatar x={24} y={178} />
        <Header x={44} y={170} />
        <g data-slot="chat-style-train">
          <Bubble x={44} y={190} width={172} height={34} />
          <Bubble x={44} y={234} width={308} height={50} />
          <Prose x={58} y={203} width={140} short={true} single={true} />
          <Prose x={58} y={247} width={260} short={true} />
        </g>
      </Speaker>
    </>
  ),
};

/** Artwork emphasizes structural differences without claiming to reproduce the viewer's transcript. */
function StylePreview({ style }: { readonly style: ChatStyle }): ReactElement {
  return (
    <Stack className="h-full w-full text-foreground" data-chat-style={style} data-slot="chat-style-preview">
      <svg
        aria-hidden={true}
        focusable="false"
        data-slot="chat-style-diagram"
        data-header-placement={MESSAGE_ROW_SKINS[style].headerPlacement}
        viewBox="0 0 400 300"
        width="100%"
        height="100%"
      >
        {STYLE_DRAWINGS[style]}
      </svg>
    </Stack>
  );
}

export interface ChatStyleCardsProps {
  /** The bound field's current value — the checked cell. */
  readonly value: ChatStyle;
  /** The bound field's write — same seam the Select drove. */
  readonly onPick: (value: ChatStyle) => void;
}

/**
 * The picker. ONE radiogroup with one tab stop, roving focus and arrow selection (#981 F20) — it used to be
 * eight independent `aria-pressed` buttons. Each cell's accessible name is its VISIBLE label through
 * `aria-labelledby` and the gloss is its `aria-describedby` (§13.10 N1/N2, the #1022 ruling preserved): the
 * name is still exactly "Bubble", and no visible word is dropped from it.
 */
export function ChatStyleCards({ value, onPick }: ChatStyleCardsProps): ReactElement {
  const ids = useId();
  return (
    <RadioGroupPicker
      aria-label="Chat display"
      data-slot="chat-style-cards"
      detail={true}
      onValueChange={(next): void => onPick(next as ChatStyle)}
      value={value}
    >
      {THEME_CHAT_STYLES.map((style) => {
        const option = optionFor(style);
        return (
          <RadioGroupPickerItem
            key={style}
            art={<StylePreview style={style} />}
            {...(option.description === undefined ? {} : { description: option.description })}
            idPrefix={`${ids}-${style}`}
            label={option.label}
            shape="standard"
            value={style}
          />
        );
      })}
    </RadioGroupPicker>
  );
}
