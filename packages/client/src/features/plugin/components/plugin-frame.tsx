// plugin-frame — the EMBEDDER side of the U7 escape hatch (seam 13). It mints a
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
// ── THE RELAY, AND WHY THE FRAME OWNS IT ────────────────────────────────────────────────────────────────────
// A relayed call goes to `plugin.uiHostCall` through `usePluginHostCall`, the same relay the scripted tier uses
// (#106: a frame gets the same server-gated host access as a scripted surface). The relay is bound HERE, to this
// mount's `pluginId` and `chatId`, and is not a prop. The server's owner-scope rung admits EVERY plugin the
// signed-in person installed, so it cannot tell which of their plugins a message came from. The binding of this
// frame's window to this plugin's id is the one control that stops a frame from spending a sibling plugin's
// grants, and it holds only if nothing in the message can choose the id: `parsePluginFrameCall` keeps `callId`,
// `fn` and `args` and drops everything else, and the relay takes no id per call. Owning it here also means no
// anchor can mount a frame without its relay or with another plugin's, the same way no anchor can mount one
// without its attribution shell.
//
// A frame whose plugin holds no proxyable grant still gets the one-word refusal for every call, from the server.

import type { PluginFrameCall } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_CALL_REFUSED, PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX, parsePluginFrameCall, pluginFrameResultMessage } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { SandboxFrame, useSandboxTheme } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";
import { useRef } from "react";
import { usePluginFrameSrc } from "#data";
import { usePluginHostCall } from "../hooks/use-plugin-host-call.ts";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginFrameProps {
  readonly pluginId: PluginId;
  /** The room this frame is mounted in, when its anchor has one (a chat anchor or a transcript tool card). The
   *  relay scopes chat-scoped host calls to it; absent, those calls are refused server-side for want of a room.
   *  The frame itself can never name a room. */
  readonly chatId?: ChatId | undefined;
  /** The `host.ui.registerFrame` surface id — half of the mint selector. */
  readonly surfaceId: string;
  /** The owning plugin's display name — the attribution line. Required: see the shell note below. */
  readonly pluginName: string;
  /** The surface's own title (`host.ui.registerFrame`'s `title`). */
  readonly title: string;
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
export function PluginFrame({ pluginId, chatId, surfaceId, pluginName, title, fallback = null, scale = "panel" }: PluginFrameProps): ReactElement | null {
  const inFlight = useRef(0);
  const hostCall = usePluginHostCall(pluginId, chatId);
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
    // CHECK 3 — the in-flight budget. Over it, the call is refused, not queued.
    if (inFlight.current >= PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX) {
      refuse();
      return;
    }
    inFlight.current += 1;
    // The wire carries arguments as a JSON document, positional like the scripted guest's. An absent or null
    // `args` is a no-argument call. Encoding runs inside the promise, so an unencodable value (a cycle, a
    // BigInt) becomes a refusal rather than a throw out of the message listener.
    const relay = async (): Promise<unknown> => JSON.parse(await hostCall(call.fn, JSON.stringify(call.args ?? []))) as unknown;
    // @orb-waive caught-failure-ownership(relay): a rejection replies with the generic
    // `refuse()` message by design (the contract's own note — the reason is an oracle a hostile document
    // does not get for free). Ends if the refusal reply is ever dropped.
    relay()
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
