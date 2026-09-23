// The `/plugin <slug> <name> <rest>` GRAMMAR + the #791 TYPED-ARG grammar — one pure parser home.
//
// WHY ONE STATIC DISPATCHER AND NOT A COMMAND PER PLUGIN. The slash registry is assembled ONCE at the door (G8)
// and its members are fixed first-party contributions; a per-plugin token would mean the door grows when a
// person installs something, which is precisely the one-assembly law's failure mode. It also means no plugin can
// ever claim `/summon` and shadow a house command — a plugin's whole reachable namespace is the two tokens after
// `/plugin`, and both are resolved against the caller's OWN installs. Per-command FIRST-CLASS palette rows are
// U8 (the dynamic palette source), which is a different mechanism, not this one wearing more paint.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import type { SlashArgOffer } from "#lib";

/** A parsed `/plugin` invocation. Every field may be empty — the runner decides what an incomplete line means,
 *  because "what do I tell the person" is a surface decision and this is a parser. */
export interface PluginCommandInvocation {
  /** The install slug (`plugin.listCommands`' projected `slug`). `""` for a bare `/plugin`. */
  readonly slug: string;
  /** The command's guest-local name. `""` when the line named a slug and stopped. */
  readonly name: string;
  /** Everything after the name, trimmed — the guest's own argument grammar, untouched. */
  readonly args: string;
}

/** Split `<slug> <name> <rest>` off the raw remainder. Whitespace-tolerant (a person types one space or three);
 *  `rest` keeps its INTERNAL spacing verbatim, because a command's args are the plugin's grammar and collapsing
 *  them would be this parser making a decision that is not its to make. */
export function parsePluginCommand(raw: string): PluginCommandInvocation {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { slug: "", name: "", args: "" };
  }
  const firstGap = trimmed.search(/\s/);
  if (firstGap === -1) {
    return { slug: trimmed, name: "", args: "" };
  }
  const slug = trimmed.slice(0, firstGap);
  const afterSlug = trimmed.slice(firstGap).trimStart();
  const secondGap = afterSlug.search(/\s/);
  if (secondGap === -1) {
    return { slug, name: afterSlug, args: "" };
  }
  return { slug, name: afterSlug.slice(0, secondGap), args: afterSlug.slice(secondGap).trim() };
}

// ── The TYPED-ARG grammar (#791) — the composer's `name=value` parsing over a command's declared specs ──────────
// The clean core of ST's argument parsing: NAMED args (`name=value`, quoted values may hold spaces) and
// POSITIONAL args (a bare token fills the next unnamed declared arg, in declaration order). It produces a raw
// STRING map keyed by declared arg name; the contracts `coercePluginCommandArgs` then types + validates it. ST's
// exotic grammar (closures, macro-in-arg substitution, `acceptsMultiple`, list/dictionary) is out — a command
// that needs it keeps the raw `args` remainder.

/** Split an arg string into whitespace-delimited tokens, honoring `"…"` quotes so a value may hold spaces. The
 *  quote chars are STRIPPED (they are grammar, not content), so `label="two words"` yields one token
 *  `label=two words` and a bare `"two words"` yields one token `two words`. */
function splitArgTokens(raw: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let sawContent = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote;
      sawContent = true;
      continue;
    }
    if (/\s/.test(ch) && !inQuote) {
      if (sawContent) {
        tokens.push(current);
      }
      current = "";
      sawContent = false;
      continue;
    }
    current += ch;
    sawContent = true;
  }
  if (sawContent) {
    tokens.push(current);
  }
  return tokens;
}

/** Parse the composer's raw arg string into the raw-STRING input map the coercion step consumes, mapping each
 *  token to a DECLARED arg name: `name=value` binds by name (unknown names fall through to positional), and a
 *  bare token fills the next declared arg with no bound value yet (declaration order). A later value for the same
 *  name wins. Extra positionals past the declared list are dropped (the command declared what it accepts). */
export function parseCommandArgInputs(specs: readonly PluginCommandArgSpec[], argsText: string): Record<string, string> {
  const raw: Record<string, string> = {};
  const positional: string[] = [];
  for (const token of splitArgTokens(argsText.trim())) {
    const eq = token.indexOf("=");
    if (eq > 0 && specs.some((spec) => spec.name === token.slice(0, eq))) {
      raw[token.slice(0, eq)] = token.slice(eq + 1);
    } else {
      positional.push(token);
    }
  }
  let cursor = 0;
  for (const spec of specs) {
    if (cursor >= positional.length) {
      break;
    }
    if (raw[spec.name] === undefined) {
      const value = positional[cursor];
      if (value !== undefined) {
        raw[spec.name] = value;
      }
      cursor += 1;
    }
  }
  return raw;
}

// ── The COMPOSER arg autocomplete (#791) — live hinting of a plugin command's declared args + enum-value
//    completion in the `/plugin <slug> <cmd> …` composer strip. Pure, so it is unit-tested off the raw string.

/** The `<slug> <cmd>` context of an in-progress `/plugin` arg line, plus the REST (the args portion, with its
 *  leading whitespace). Null when the line has not resolved a command yet (still typing slug/cmd), which is
 *  exactly when arg hints should not show. `prefix` is `<slug> <cmd>` — an offer's `insert` prepends it so the
 *  composer's `/plugin <insert>` reconstruction keeps the dispatch grammar intact. */
export function parsePluginArgContext(
  argsText: string,
): { readonly slug: string; readonly name: string; readonly prefix: string; readonly rest: string } | null {
  const match = /^\s*(\S+)\s+(\S+)(\s[\s\S]*)?$/.exec(argsText);
  if (match === null) {
    return null;
  }
  const slug = match[1] ?? "";
  const name = match[2] ?? "";
  const rest = match[3];
  if (rest === undefined) {
    // Exactly `<slug> <cmd>` with no trailing space — the command token may still be being typed, so no args yet.
    return null;
  }
  return { slug, name, prefix: `${slug} ${name}`, rest };
}

/** The arg offers for a resolved command's `rest` (the args portion after `<slug> <cmd>`, leading whitespace
 *  included). Two shapes, matching ST's ability: ENUM-VALUE completion when the person is mid-typing
 *  `argname=<partial>` for an enum arg, else ARG-NAME hints (the declared args not yet named, filtered by the
 *  partial token). Each offer's `insert` is the FULL remainder (`<slug> <cmd> …`) the draft becomes on pick. */
export function pluginCommandArgOffers(specs: readonly PluginCommandArgSpec[], prefix: string, rest: string): readonly SlashArgOffer[] {
  const endsWithSpace = /\s$/.test(rest);
  const trimmedRest = rest.trimStart();
  const partial = endsWithSpace ? "" : (trimmedRest.split(/\s+/).pop() ?? "");
  // `kept` is the already-typed args MINUS the partial token being extended; an offer's `insert` is
  // `<prefix> <kept> <completion>` (empty parts dropped), so prior args survive verbatim and the completion is
  // always space-delimited without hand-managed spacing.
  const kept = endsWithSpace ? trimmedRest : trimmedRest.slice(0, trimmedRest.length - partial.length).trim();
  const compose = (completion: string): string => [prefix, kept, completion].filter((part) => part !== "").join(" ");

  const eq = partial.indexOf("=");
  if (eq > 0) {
    // Mid-typing `argname=<partialVal>` — offer the enum values (if this arg is an enum) that extend it.
    const argName = partial.slice(0, eq);
    const partialVal = partial.slice(eq + 1);
    const spec = specs.find((candidate) => candidate.name === argName && candidate.type === "enum");
    if (spec === undefined) {
      return [];
    }
    return (spec.enumValues ?? [])
      .filter((value) => value.startsWith(partialVal))
      .map((value) => ({ id: `${argName}=${value}`, label: value, describe: `${argName} value`, insert: compose(`${argName}=${value}`) }));
  }

  // Otherwise offer ARG NAMES not yet named in the HEAD (the partial being typed is NOT counted — the person is
  // typing that arg's name right now), matching the partial prefix. A trailing-space line (partial === "") offers
  // every remaining arg — the "what can I pass here" hint. Only explicit `name=` tokens count as present, never a
  // positional (a positional is a dispatch-time fill; a person may still name it explicitly here).
  const present = new Set(
    splitArgTokens(kept)
      .filter((token) => token.indexOf("=") > 0)
      .map((token) => token.slice(0, token.indexOf("="))),
  );
  return specs
    .filter((spec) => !present.has(spec.name) && spec.name.startsWith(partial))
    .map((spec) => ({
      id: spec.name,
      label: spec.name,
      describe: `${spec.type}${spec.required === true ? ", required" : ""}${spec.type === "enum" ? ` (${(spec.enumValues ?? []).join("|")})` : ""}`,
      insert: compose(`${spec.name}=`),
    }));
}
