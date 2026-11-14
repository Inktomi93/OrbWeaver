// A regex script's two axes as one glyph strip: what it changes, then when it runs, each glyph named by its label.
// The library rows, the room's Regex section and its legend all draw this one strip, so the axes read the same
// everywhere. A target the passes do not read draws receded and is named "not applying"; it is never dropped,
// because the stored script still holds it.
//
// The elements are built once at module scope: the strip multiplies with the rows, and an element is an immutable
// description that every row's strip can share. Each carries its own key, which keeps a hoisted node legal in a list.

import type { RegexPass, RegexTarget } from "@orb/kit/regex";
import { Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import {
  REGEX_PASS_GLYPHS,
  REGEX_PASS_LABELS,
  REGEX_TARGET_GLYPHS,
  REGEX_TARGET_LABELS,
  regexPassStages,
  regexTargetStages,
  regexUnreadTargetName,
  regexUnreadTargets,
} from "#lib";

const targetNode = (target: RegexTarget, unread: boolean): ReactElement =>
  unread ? (
    <Icon icon={REGEX_TARGET_GLYPHS[target]} key={target} label={regexUnreadTargetName(target)} receded={true} size="xs" />
  ) : (
    <Icon icon={REGEX_TARGET_GLYPHS[target]} key={target} label={REGEX_TARGET_LABELS[target]} size="xs" />
  );

const passNode = (pass: RegexPass): ReactElement => <Icon icon={REGEX_PASS_GLYPHS[pass]} key={pass} label={REGEX_PASS_LABELS[pass]} size="xs" />;

// Exhaustive computed-key records, so a new kit member fails `tsc` here as in every other presentation of the axes.
const TARGET_NODES: Record<RegexTarget, { readonly read: ReactElement; readonly unread: ReactElement }> = {
  ["USER_INPUT"]: { read: targetNode("USER_INPUT", false), unread: targetNode("USER_INPUT", true) },
  ["AI_OUTPUT"]: { read: targetNode("AI_OUTPUT", false), unread: targetNode("AI_OUTPUT", true) },
  ["WORLD_INFO"]: { read: targetNode("WORLD_INFO", false), unread: targetNode("WORLD_INFO", true) },
  ["REASONING"]: { read: targetNode("REASONING", false), unread: targetNode("REASONING", true) },
};

const PASS_NODES: Record<RegexPass, ReactElement> = {
  save: passNode("save"),
  display: passNode("display"),
  prompt: passNode("prompt"),
};

export interface RegexAxesGlyphsProps {
  readonly targets: readonly RegexTarget[];
  readonly passes: readonly RegexPass[];
}

/** The strip, as phrasing content: it renders inside a row's subtitle span. */
export function RegexAxesGlyphs({ targets, passes }: RegexAxesGlyphsProps): ReactElement {
  const unread = regexUnreadTargets({ targets, passes });
  return (
    <Text as="span" className="align-middle" flow="clusterTight">
      {regexTargetStages(targets).map((target) => TARGET_NODES[target][unread.includes(target) ? "unread" : "read"])}
      {targets.length > 0 && passes.length > 0 ? (
        <Text aria-hidden={true} as="span" voice="quiet">
          ·
        </Text>
      ) : null}
      {regexPassStages(passes).map((pass) => PASS_NODES[pass])}
    </Text>
  );
}
