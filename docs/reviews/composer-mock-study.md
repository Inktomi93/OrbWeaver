# Two-row composer mock

## Deliverable

The interactive comparison is `reports/mocks/composer-study/index.html`, served locally at `http://127.0.0.1:8766/` for owner review.
It compares a reconstructed ST layout with a proposed Orbweaver composer. Reference measurements and menu contents come from the [reference review](composer-reference-review.md).
Text is a synthetic Hikari scene. No private transcript, credentials or production service is embedded.

## Approved direction

The owner approves this composition as the implementation direction. The active thread goal includes evidence-backed appearance-default changes where needed.
The owner authorizes overwriting his appearance preferences to evaluate and adopt good defaults; his database is disposable.
Preserve other users' saved overrides. Prototype pixel heights are comparison evidence, not new hardcoded design values.

The upper row holds Tools, Plugins and grouped generation actions. The lower row holds Chat options, the draft and Send.
Group chats retain speaker selection in the reply menu. Chat options links to the existing Context chat settings without duplicating its editor.
Verify group chats and active generation states within the same two-row layout.
Plugin commands stay in their attributed menu; enabled plugins do not automatically gain full-text composer buttons.
Context contains a Plugins tab with stacked, independently collapsible panels. A sidecar is explicitly selected, never reserved by default.
The message identity and action header remains sticky, with an opaque reading background and no deep fade over prose.

The selected reading defaults are flat messages with small rounded avatars. The measured comparison provides more portrait reading space without larger text.
Keep text metrics, quote colorization and blur preferences unchanged unless separate evidence supports changing them.
Panel placement is selected per surface: moving one panel to the sidecar leaves the others in Context.

The prototype measures 94px composer height on desktop, 106px in portrait and 102px in landscape.
Phone action boxes use a 44px minimum. These are prototype measurements, not production acceptance.

## Interaction coverage

Desktop comparison, portrait Tools menu, landscape plugin menu and Context panel were rendered with Snap.
Menu entries, image subjects, impersonation-person choices, view toggles and device previews are interactive.
Commands show a preview-only notice. They do not send, generate, mutate settings or call a backend.
Escape closes menus and panel previews; menu arrow keys move focus.

## Boundaries

This is a standalone design artifact, not a replacement implementation of the production primitives or authoring contracts.
The ST side reconstructs grouping and approximate geometry, not fonts, artwork or every theme detail pixel-for-pixel.
Its phone wrapping reflects the observed additional row. The proposed Orbweaver composer retains the owner's two-row requirement.
The production plan must map accepted choices back to existing tokens, sealed controls and contribution contracts.
The optional sidecar is approved as an explicit choice, not a default reservation. Its placement API must preserve the existing plugin authoring contract.

The [implementation review](composer-implementation-review.md) records the production result and verification.
