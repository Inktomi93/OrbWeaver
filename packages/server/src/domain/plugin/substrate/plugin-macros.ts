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
import { PLUGIN_TOOL_NAME_PREFIX, pluginToolWireName } from "@orb/contracts/plugin";
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
  /** The PRE-#1391 spelling of {@link RegisteredMacro.name}, or `null` when the slug carries no hyphen and the
   *  two spellings coincide. Carried per macro so the degrade alias below costs no second flatten at
   *  resolution time and no second source of truth about what the old name was. */
  readonly legacyName: string | null;
  readonly description: string;
  readonly resolve: (chat: InvocationChat | null) => Promise<string>;
}

/** The host namespace a plugin macro's name lands in. The slug is HOST knowledge (derived from the
 *  re-validated manifest), so a guest can neither shadow a builtin (`{{char}}`) nor collide with another
 *  plugin; hyphens are illegal in the middle of a macro name run, so the slug's are transliterated.
 *
 *  IT DELEGATES TO THE TOOL MINT AND THAT IS THE POINT (#1391). This used to spell the flattening a second
 *  time (`slug.replaceAll("-", "_")`), which meant the macro plane and the tool plane were two homes for ONE
 *  namespace rule — and when the tool mint was made injective, the drift would have been silent in both
 *  directions. `pluginToolWireName` is the one mint (`contracts/plugin/registrations.ts`, where the
 *  injectivity proof lives); this function is the macro plane's NAME for it, not a second rule. The two
 *  planes are separate registries, so the identical string in each is not a collision. */
export function pluginMacroName(slug: string, guestName: string): string {
  return pluginToolWireName(slug, guestName);
}

/** The PRE-#1391 spelling of {@link pluginMacroName} — the slug's hyphens folded to a SINGLE underscore.
 *
 *  THIS IS A DEGRADE PATH, NOT A SECOND MINT, and the distinction is the whole reason it may exist: nothing
 *  ever MINTS this name, and no registry key is derived from it. It exists only because a plugin macro's name
 *  is USER-TYPED CONTENT — a host writes `{{plugin_oracle_deck_omen}}` into a persona note, a scenario line or
 *  an author's note, and that prose is not a row this app may rewrite (unlike the `ToolCallRecord.name` and
 *  `run_tool` arm spellings, which #1391's boot migrations do rewrite). Renaming the macro with no fallback
 *  would silently render those references as "" — the exact silent-loss class #1649 ruled against.
 *
 *  The fallback is applied ONLY at `resolveForTurn`, ONLY when the legacy spelling is claimed by exactly one
 *  of the author's own macros, and ONLY when it does not shadow a live name (see the alias fold below). An
 *  ambiguous legacy name — which is precisely the pre-#1391 defect this row fixed — stays unresolved, i.e.
 *  exactly today's behaviour. Returns `null` when the slug has no hyphen and the two spellings coincide. */
function pluginMacroLegacyName(slug: string, guestName: string): string | null {
  if (!slug.includes("-")) {
    return null;
  }
  return `${PLUGIN_TOOL_NAME_PREFIX}${slug.replaceAll("-", "_")}_${guestName}`;
}

/** Race one guest resolution against the shared deadline. Resolves to `null` on ANY failure — a throw, a
 *  rejected invoke, or the deadline — because every one of them means the same thing to a render: this macro
 *  has no value this turn. The caller turns `null` into an empty body rather than dropping the macro, so a
 *  reference to it still renders (as "") instead of re-emitting raw `{{…}}` bytes into the prompt. */
async function resolveOne(macro: RegisteredMacro, chat: InvocationChat | null, deadline: Promise<null>): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): documented above — a throw, a rejected invoke,
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
      legacyName: pluginMacroLegacyName(req.slug, macro.name),
      description: macro.description,
      // The guest receives an EMPTY args object (the single-arg host→guest seam, arity-stable) and the turn's
      // chat scope, so `chat.current()` works inside a macro resolver exactly as it does inside a tool handler.
      resolve: async (chat): Promise<string> => req.invoke(macro.handler, "{}", chat),
    }));
    const forInstaller = byInstaller.get(req.installer) ?? new Map<string, readonly RegisteredMacro[]>();
    forInstaller.set(req.slug, entries);
    byInstaller.set(req.installer, forInstaller);
    return {
      // THE HANDLE UNREGISTERS ITS OWN REGISTRATION, NOT THE KEY (#1480 item 5). `entries` is this call's
      // freshly-built array, so the identity check answers "does the map still hold what I put there?" —
      // a handle kept from a superseded registration is inert. Without it, `unregister` deleted whatever
      // (installer, slug) currently mapped to, so a stale handle silently evicted the registration that
      // replaced it: the plugin stays ACTIVE in the activation registry while every one of its macros
      // renders as raw `{{…}}` bytes in that installer's prompts until a re-activation heals it. No caller
      // holds a stale handle today (`deactivate` re-reads the live handles; `activate`'s rollback only
      // unregisters its own failed attempt before any `registry.set`) — this is the local belt so that
      // staying true is not a property of every future caller's discipline.
      unregister: (): void => {
        const live = byInstaller.get(req.installer);
        if (live === undefined || live.get(req.slug) !== entries) {
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
      const defs = macros.map((macro, index) => toDef(macro.name, macro, values[index] ?? null));
      return [...defs, ...legacyAliases(macros, values)];
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
function toDef(name: string, macro: RegisteredMacro, value: string | null): UserMacroDef {
  return {
    name,
    description: macro.description,
    args: [],
    body: neutralizeMacros(value ?? ""),
    inputs: [],
    strict: false,
  };
}

/** The #1391 LEGACY-SPELLING fold: the extra defs that let prose written before the injective rename keep
 *  resolving. See {@link pluginMacroLegacyName} for why this exists at all (a macro reference is user-typed
 *  content in a persona note or scenario line, and no migration can reach it).
 *
 *  TWO GUARDS, and both are refusals rather than guesses:
 *    • UNIQUENESS — a legacy spelling claimed by TWO of this author's macros is the pre-#1391 ambiguity itself
 *      (`foo-bar`/`baz` and `foo`/`bar_baz` both answered to `plugin_foo_bar_baz`). Resolving it would pick a
 *      winner the author never chose, so it resolves to nothing, exactly as it does today.
 *    • NO SHADOWING — a legacy spelling that equals some macro's LIVE name loses to the live name. The
 *      alias plane may never take a name the current mint hands out.
 *  The values array is the ALREADY-RESOLVED per-turn answers, so an alias costs no second guest invoke: one
 *  resolution, two names pointing at it. */
function legacyAliases(macros: readonly RegisteredMacro[], values: readonly (string | null)[]): readonly UserMacroDef[] {
  const live = new Set(macros.map((macro) => macro.name));
  const claims = new Map<string, number>();
  for (const macro of macros) {
    if (macro.legacyName !== null) {
      claims.set(macro.legacyName, (claims.get(macro.legacyName) ?? 0) + 1);
    }
  }
  return macros.flatMap((macro, index) => {
    const legacy = macro.legacyName;
    if (legacy === null || claims.get(legacy) !== 1 || live.has(legacy)) {
      return [];
    }
    return [toDef(legacy, macro, values[index] ?? null)];
  });
}
