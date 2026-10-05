# Draft Polish

Draft Polish offers an explicit pre-send action and viewer-local typesetting. It does not register a hidden outgoing prompt transform.

## Use it

1. Open Settings → Plugins → Draft Polish.
2. Allow `ui.surface` for the composer action and `chat.transform` for display typesetting.
3. Turn the plugin on.
4. Type your message, then choose Polish in the composer actions. Narrow composers put it inside Plugin actions.
5. Read the replacement before sending. Undo Polish restores the exact prior draft.

Undo remains available until you edit, send, or change rooms. A late response cannot replace a draft you edited while it ran.

Send uses the normal chat path. The visible replacement is what you send; choosing not to polish leaves your draft unchanged.

## Turn it off

Use the Draft Polish switch in Settings → Plugins. The composer action disappears and transcript rows return to their normal display without reloading.

Revoking `ui.surface` removes the explicit action. Revoking `chat.transform` removes display typesetting. No chat macro is needed.

## Authoring

Copy this bundle, change its manifest identity, and build it against the matching SDK before packing. The author guide is [bundles/README.md](../README.md).

`ui.registerCommand` declares `composerDraft: true` with only a `composer-action` placement. Its handler receives the draft only after an explicit composer click and returns a string replacement.

The host bounds input and output, checks owner and current plugin grants, and refuses nonstring results. Ordinary commands and background events receive no composer draft.

`transforms.registerDisplay` decorates only the installer's rendered rows. Display output never re-enters macro resolution or changes stored canon.

Both paths split out backtick code spans and fenced blocks, transform only prose, and reassemble the code bytes unchanged. Internal newlines remain intact.

The visible Polish replacement uses Send's existing edge-whitespace normalization. Undo still restores the original bytes, including that whitespace.

The general prompt-transform API remains available for other plugins. This example uses the visible composer ceremony instead.
