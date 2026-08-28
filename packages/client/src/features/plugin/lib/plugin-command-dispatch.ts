// The `/plugin <slug> <name> <rest>` GRAMMAR — one pure parser, one home (plugin-ui-plane #679 U5, §4.5).
//
// WHY ONE STATIC DISPATCHER AND NOT A COMMAND PER PLUGIN. The slash registry is assembled ONCE at the door (G8)
// and its members are fixed first-party contributions; a per-plugin token would mean the door grows when a
// person installs something, which is precisely the one-assembly law's failure mode. It also means no plugin can
// ever claim `/summon` and shadow a house command — a plugin's whole reachable namespace is the two tokens after
// `/plugin`, and both are resolved against the caller's OWN installs. Per-command FIRST-CLASS palette rows are
// U8 (the dynamic palette source), which is a different mechanism, not this one wearing more paint.

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
