// plugin-frame — the EMBEDDER side of the U7 escape hatch (plugin-ui-plane #679, §6.2, seam 13). It mints a
// routed document for one `frame`-tier surface, embeds it through the sealed `@orb/ui` `SandboxFrame`, and owns
// the PARSE + BUDGET + RELAY of everything the frame says over the postMessage bridge.
//
// ── WHERE THE TRUST BOUNDARY IS SPLIT, AND WHY ───────────────────────────────────────────────────────────────
// The iframe element, its sandbox attribute, its styling, and the WINDOW-IDENTITY authentication all live in
// `@orb/ui`'s `SandboxFrame` — the painter that owns the iframe ref, and the one home where "the sender is this
// frame's own window" is already implemented for the card frame's height channel. That check is the only
// authentication this channel can perform: every sandboxed document reports `event.origin === "null"`, so origin
// cannot tell OUR frame from another opaque sender on the page. It stays in ONE audited place rather than being
// re-implemented per consumer.
//
// What CANNOT move up there is the meaning of the message: `@orb/ui` deps `kit` only (the cake), so it cannot
// import `@orb/contracts`, where the bridge parse lives. So the split is exact — `SandboxFrame` proves WHO sent
// a message (window identity), this feature decides WHAT it is (parse) and whether to act (budget + relay). The
// three checks, in order, none trusting the message's contents:
//
//   1. SENDER — proven in `SandboxFrame` before `onHostMessage` ever fires (window identity).
//   2. SHAPE — the payload is PARSED, not read (`parsePluginFrameCall`). A message that is not a namespaced call
//      is not a call — including the card-frame height report, which rides this same window and which
//      `SandboxFrame` has already folded before handing the data here.
//   3. BUDGET — at most `PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX` relayed calls outstanding at once. A hostile frame can
//      post as fast as it likes; without this its parent would queue an unbounded number of relays.
//
// Only then is the call handed to the relay, which re-gates it SERVER-side (`fn ∈ UI_PROXYABLE ∩ grants`,
// resolved off the caller's own rows). Nothing here decides authorization; it decides only what is worth
// relaying at all.
//
// ── THE U4 INTEGRATION SEAM, STATED PRECISELY ────────────────────────────────────────────────────────────────
// `hostCall` is the relay to `plugin.uiHostCall` — U4's proc, NOT on main at the time this landed. The prop is
// OPTIONAL and its absence is a REFUSAL, not a stub: every call is answered with the same one-word refusal the
// server gives for an unproxyable fn or a missing grant. That is production behaviour, not scaffolding — a frame
// whose plugin holds no proxyable grants gets exactly this answer after U4 lands too, and fail-closed is the
// correct default for a channel whose relay is unavailable. Wiring U4 is passing this prop at the anchor arms;
// nothing else here changes.

import type { PluginFrameCall } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_CALL_REFUSED, PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX, parsePluginFrameCall, pluginFrameResultMessage } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { SandboxFrame, useSandboxTheme } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";
import { useRef } from "react";
import { usePluginFrameSrc } from "#data";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

/** Relay one host call to `plugin.uiHostCall` (U4). Resolves to the call's value, or REJECTS — a rejection is
 *  answered to the frame with the one-word refusal, never with the reason. Local to this feature (U4 wires it
 *  in at the anchor arms); not a cross-boundary type, so it stays unexported per the type-home rule. */
type PluginFrameHostCall = (call: { readonly pluginId: PluginId; readonly fn: string; readonly args: unknown }) => Promise<unknown>;

export interface PluginFrameProps {
  readonly pluginId: PluginId;
  /** The `host.ui.registerFrame` surface id — half of the mint selector. */
  readonly surfaceId: string;
  /** The owning plugin's display name — the attribution line. Required: see the shell note below. */
  readonly pluginName: string;
  /** The surface's own title (`host.ui.registerFrame`'s `title`). */
  readonly title: string;
  /** The relay to `plugin.uiHostCall`. Absent ⇒ every host call is refused (see the header). */
  readonly hostCall?: PluginFrameHostCall | undefined;
  /** Which shell chrome to draw the frame inside — forwarded verbatim to {@link PluginSurfaceShell} (#787).
   *  DEFAULT `panel`, the room/settings/tool-card/dialog scale. A `page`-anchored frame passes `page` so the
   *  §9 pinned attribution band wraps it: a full-page frame is arbitrary HTML at the biggest impersonation
   *  scale in the design, so it needs the wall the vocabulary pages get, not the smaller panel band. */
  readonly scale?: "panel" | "page" | undefined;
  /** What to render when the frame cannot be had — DEFAULT `null`, which is the flank law (§4.9).
   *
   *  It exists because ONE anchor's law is the opposite. A `tool-card` frame sits on CANON: the call happened
   *  and the model read its result, so the transcript owes the reader a record of it and silence would delete
   *  evidence from a conversation. That anchor passes the generic `ToolCallBlock`; every other anchor takes the
   *  default and collapses. A caller must not be able to get this wrong by omission, which is why the SAFE
   *  behaviour is the default and the loud one is opt-in. */
  readonly fallback?: ReactElement | null;
}

/**
 * One plugin `frame`-tier surface INSIDE its attribution shell, or the `fallback` (default `null`).
 *
 * THE SHELL IS DRAWN HERE, NOT BY THE CALLER, and that is deliberate on two counts. First §4.8: the label is
 * the impersonation wall and it has no opt-out, so the component that draws the frame is the one that draws the
 * label — a caller cannot mount a plugin frame without its attribution because there is no API for it. Second
 * the flank law: a caller wrapping this in a shell would render an EMPTY labelled box whenever the mint has not
 * resolved (or cannot), which is precisely the "broken frame in the room" §4.9 forbids. Returning the fallback
 * for the whole thing — chrome included — is what makes "renders nothing" true.
 */
export function PluginFrame({ pluginId, surfaceId, pluginName, title, hostCall, fallback = null, scale = "panel" }: PluginFrameProps): ReactElement | null {
  const inFlight = useRef(0);
  const { themeTokens, styleTokens, fontFamily } = useSandboxTheme();
  const src = usePluginFrameSrc({ pluginId, surfaceId, styleTokens, themeTokens, fontFamily });

  // `onHostMessage` fires ONLY for a message `SandboxFrame` has already authenticated as coming from this
  // frame's own window (check 1). `reply` posts back to that same window. Checks 2 (parse) and 3 (budget) are
  // ours. A plain function, not a `useCallback` — the React Compiler memoizes it (manual memo is banned,
  // `react-compiler-no-manual-memo`), which is also what keeps `SandboxFrame`'s listener effect from
  // re-subscribing every render.
  const onHostMessage = (data: unknown, reply: (message: unknown) => void): void => {
    const call: PluginFrameCall | undefined = parsePluginFrameCall(data);
    if (call === undefined) {
      return;
    }
    const refuse = (): void => reply(pluginFrameResultMessage({ callId: call.callId, ok: false, error: PLUGIN_FRAME_CALL_REFUSED }));
    // CHECK 3 — the in-flight budget. Over it (or with no relay wired), the call is refused, not queued.
    if (hostCall === undefined || inFlight.current >= PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX) {
      refuse();
      return;
    }
    inFlight.current += 1;
    // @orb-waive caught-failure-ownership(hostCall): a rejection replies with the generic
    // `refuse()` message by design (the contract's own note — the reason is an oracle a hostile document
    // does not get for free). Ends if the refusal reply is ever dropped.
    hostCall({ pluginId, fn: call.fn, args: call.args })
      .then(
        (value) => reply(pluginFrameResultMessage({ callId: call.callId, ok: true, value })),
        // The refusal carries no reason: the difference between "you lack that grant" and "no such function"
        // is an oracle a hostile document does not get for free (the contract's own note).
        refuse,
      )
      .finally(() => {
        inFlight.current -= 1;
      });
  };

  if (src === undefined) {
    return fallback ?? null;
  }
  return (
    <PluginSurfaceShell pluginName={pluginName} scale={scale} title={title}>
      {/* `SandboxFrame` owns the iframe, its sandbox grant (`allow-scripts`, never `allow-same-origin`), the
          height fold, and the window-identity check. `html=""` because this is a ROUTED-ONLY surface: the srcdoc
          floor is never rendered when `src` is present (and would be script-dead anyway). The frame's accessible
          name pairs the plugin with the surface — an iframe is focusable, so `title` is what a screen reader
          announces, and the shell's visible label does not reach the tab order. */}
      <SandboxFrame
        html=""
        src={src}
        // The name-once rule (P3-7, plugin-surface-shell.tsx): a frame titled exactly like its plugin would
        // announce "Card Atlas — Card Atlas" to the one audience (AT, via the iframe's `title`) that hears
        // every word.
        title={title === pluginName ? pluginName : `${pluginName} — ${title}`}
        onHostMessage={onHostMessage}
        className="w-full rounded-base border border-border bg-card"
      />
    </PluginSurfaceShell>
  );
}
