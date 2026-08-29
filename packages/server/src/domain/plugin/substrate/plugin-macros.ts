// domain/plugin/substrate/plugin-macros — the PLUGIN MACRO plane (plugin-ui-plane §5.15, U6). One
// process-wide registry of `{installer → the macros their enabled plugins registered}`, plus the per-turn
// RESOLUTION that turns each into a `UserMacroDef` the ONE kit macro engine registers as data.
//
// WHY A PRE-RESOLVE AND NOT A HANDLER, stated where the next reader will ask: `MacroHandler` in
// `@orb/kit/macro` is SYNCHRONOUS by contract (`(args, ctx) => string`) and a guest invoke is not. Making the
// engine async to admit plugin macros would reshape every render seam in the app for one feature — and would
// mean a second evaluation model beside the one every builtin, preset and game macro already shares. So the
// guest is invoked ONCE per turn, BEFORE the render, and its answer becomes the macro's BODY. That is exactly
// what "kit/macro stays the ONE engine; plugin macros are DATA registered into it" means, mechanically.
//
// THE CONSEQUENCE, NAMED: a plugin macro takes no ARGUMENTS. An arg-taking macro would need the engine to call
// back into the guest at substitution time — the async call the engine cannot make. It is ST's own
// `registerMacro(key, value)` shape and it is a complete feature, not a stub; an arg-taking variant would be a
// different (and much larger) design about making the engine async, not a widening of this file.
//
// THE THREE BELTS every resolution carries:
//   1. SCOPE — resolution is keyed by the TURN AUTHOR, so a turn only ever renders macros from plugins that
//      author installed themselves. There is no process-global reach to gate (contrast the D50 transform
//      registry, which is chat-blind and therefore needs `isInstallerHost`).
//   2. DEADLINE — the whole per-turn resolution races `PLUGIN_MACRO_RESOLVE_DEADLINE_MS`; a slow or throwing
//      guest resolves to "" for that turn (degrade-never-throw, the law the entire macro plane obeys). A
//      broken plugin macro renders empty; it never eats the turn.
//   3. LAW 7 — the guest's answer is `neutralizeMacros`'d before it becomes a body. Plugin-authored text is
//      entering a macro-EXECUTION plane (`ctx.resolve` runs over a user-macro body), and
//      `interaction-direction-spec.md` §2 law 7 requires the house primitive at exactly that write boundary.

import type { InvocationChat, PluginMacroRegistration } from "@orb/contracts/plugin";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { UserMacroDef } from "@orb/kit/macro";
import { neutralizeMacros } from "@orb/kit/macro";
import type { PluginInvokeHandler, PluginMacroRegistry, PluginRegistrationHandle } from "../contract/ops.ts";

/** The wall-clock bound on ONE turn's whole plugin-macro resolution (every registered macro, in parallel). It
 *  is the ASSEMBLY deadline the design names, and it is deliberately larger than the 250 ms per-transform
 *  `PROMPT_TRANSFORM_DEADLINE_MS`: this races the fan of a user's macros ONCE per turn rather than a single
 *  step in an ordered fold, and it is charged to the author's own turn latency. Overrun ⇒ every unresolved
 *  macro renders "" for that turn (the same shape a slow guest gets from the transform seam's skip). */
export const PLUGIN_MACRO_RESOLVE_DEADLINE_MS = 1000;

/** The most macros one plugin may register. A macro is a per-turn guest invoke, so the count is a per-turn
 *  latency budget as much as a namespace budget; ST plugins register a handful. */
export const PLUGIN_MACROS_MAX = 16;

/** ONE registered plugin macro as the registry holds it: the host-NAMESPACED name, the guest handle, and the
 *  per-plugin invoker activation closed over. */
interface RegisteredMacro {
  readonly name: string;
  readonly description: string;
  readonly resolve: (chat: InvocationChat | null) => Promise<string>;
}

/** The host namespace a plugin macro's name lands in — the `plugin_<slug'>_<name>` rule `registerTool` uses,
 *  for the same reason: the slug is HOST knowledge (derived from the re-validated manifest), so a guest can
 *  neither shadow a builtin (`{{char}}`) nor collide with another plugin. Hyphens are illegal in the middle of
 *  a macro name run, so the slug's are folded to underscores exactly as the tool namespacer folds them. */
export function pluginMacroName(slug: string, guestName: string): string {
  return `plugin_${slug.replaceAll("-", "_")}_${guestName}`;
}

/** Race one guest resolution against the shared deadline. Resolves to `null` on ANY failure — a throw, a
 *  rejected invoke, or the deadline — because every one of them means the same thing to a render: this macro
 *  has no value this turn. The caller turns `null` into an empty body rather than dropping the macro, so a
 *  reference to it still renders (as "") instead of re-emitting raw `{{…}}` bytes into the prompt. */
async function resolveOne(macro: RegisteredMacro, chat: InvocationChat | null, deadline: Promise<null>): Promise<string | null> {
  // @orb-gate-ignore caught-failure-ownership(default:catch): documented above — a throw, a rejected invoke,
  // or the deadline all mean the same thing to a render (this macro has no value this turn); the caller
  // renders `null` as an empty body. Ends if a guest failure needs to surface distinctly from a timeout.
  try {
    return await Promise.race([macro.resolve(chat), deadline]);
  } catch {
    return null;
  }
}

/** Build the process-wide plugin-macro registry. `deadlineMs` is a getter (read per resolution) and injectable
 *  so a deadline test runs fast + deterministic — the `createPromptTransformRegistry` seam, same reason. */
export function createPluginMacroRegistry(deadlineMs: () => number = () => PLUGIN_MACRO_RESOLVE_DEADLINE_MS): PluginMacroRegistry {
  /** installer → slug → that plugin's registered macros. Two levels because the READ is per-installer and the
   *  WRITE/UNREGISTER is per-plugin; one flat map would make either the linear scan. */
  const byInstaller = new Map<UserId, Map<string, readonly RegisteredMacro[]>>();

  const register = (req: {
    readonly installer: UserId;
    readonly slug: string;
    readonly macros: readonly PluginMacroRegistration[];
    readonly invoke: PluginInvokeHandler;
  }): PluginRegistrationHandle => {
    // The per-plugin ceiling is enforced HERE (activation-fatal, like a tool-name collision): a plugin that
    // registers 500 macros is 500 guest invokes on every one of its installer's turns.
    if (req.macros.length > PLUGIN_MACROS_MAX) {
      throw new Error(`plugin macros: a plugin may register at most ${PLUGIN_MACROS_MAX} macros (got ${req.macros.length})`);
    }
    const entries: RegisteredMacro[] = req.macros.map((macro) => ({
      name: pluginMacroName(req.slug, macro.name),
      description: macro.description,
      // The guest receives an EMPTY args object (the single-arg host→guest seam, arity-stable) and the turn's
      // chat scope, so `chat.current()` works inside a macro resolver exactly as it does inside a tool handler.
      resolve: async (chat): Promise<string> => req.invoke(macro.handler, "{}", chat),
    }));
    const forInstaller = byInstaller.get(req.installer) ?? new Map<string, readonly RegisteredMacro[]>();
    forInstaller.set(req.slug, entries);
    byInstaller.set(req.installer, forInstaller);
    return {
      unregister: (): void => {
        const live = byInstaller.get(req.installer);
        if (live === undefined) {
          return;
        }
        live.delete(req.slug);
        if (live.size === 0) {
          byInstaller.delete(req.installer);
        }
      },
    };
  };

  const resolveForTurn = async (authorUserId: UserId, chatId: ChatId): Promise<readonly UserMacroDef[]> => {
    const forInstaller = byInstaller.get(authorUserId);
    if (forInstaller === undefined || forInstaller.size === 0) {
      return [];
    }
    const macros = [...forInstaller.values()].flat();
    if (macros.length === 0) {
      return [];
    }
    // A macro resolver READS; `canWrite:false` means an attempted room write inside one becomes the S4 ask (or
    // the flat refusal) it already is elsewhere, rather than a silent write from inside prompt assembly.
    const chat: InvocationChat = { chatId, canWrite: false, automationDepth: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), deadlineMs());
    });
    try {
      const values = await Promise.all(macros.map((macro) => resolveOne(macro, chat, deadline)));
      return macros.map((macro, index) => toDef(macro, values[index] ?? null));
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };

  return { register, resolveForTurn };
}

/** One resolved macro as a kit `UserMacroDef`: no args, no inputs, and the guest's answer as the BODY —
 *  NEUTRALIZED first (interaction-spec §2 law 7: plugin-authored text entering a macro-execution plane goes
 *  through the house primitive at the write boundary, so a plugin can never emit `{{getglobalvar::…}}` and
 *  have the engine resolve it). `strict:false` matches every other authored macro. */
function toDef(macro: RegisteredMacro, value: string | null): UserMacroDef {
  return {
    name: macro.name,
    description: macro.description,
    args: [],
    body: neutralizeMacros(value ?? ""),
    inputs: [],
    strict: false,
  };
}
