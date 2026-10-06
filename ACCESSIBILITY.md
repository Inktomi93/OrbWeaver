# Accessibility

Orbweaver is a chat app you might sit in for hours, on a laptop at night or a phone in bed. Reading comfort
and getting around without a mouse are part of the job, not extras. I went a little overboard here, honestly.
This page covers what Orbweaver does, what isn't covered yet, and how to tell me when something gets in your
way.

## What Orbweaver does

**Text you can read, enforced by the theme engine.** Themes are fully customizable, including the colors that
ride in on imported SillyTavern cards, and that is exactly how you end up with dark grey text on a dark
background. So the theme engine checks every text color against the surface it actually lands on. When a pair
falls under WCAG AA (4.5:1), it re-derives the lightness and keeps the hue. Your theme still looks like your
theme. You can just read it now. Every theme Orbweaver ships is also checked at build time: every text color,
on every background it can sit on, clears 4.5:1 or the build fails.

**Touch targets that fit a thumb.** On a touch screen every control has a hit area of at least 44px,
checkboxes and icon buttons included. The hit area grows even when the visible box stays small. With a mouse
the floor is 32px, above the 24px WCAG 2.5.8 asks for.

**Keyboard first.** Ctrl+K (⌘K on a Mac) jumps to any section, recent chat or create action. Esc closes the
top layer. Focus is always visible, and when a view opens, focus moves into it instead of leaving you stranded
at the top of the page. A build check fails any new screen that skips that.

**Built for screen readers.** Controls carry accessible names, and streaming replies, status changes and
notices are announced through live regions. A lint rule set (eslint-plugin-jsx-a11y) blocks the common markup
mistakes before they get committed, and the design audit tool checks accessible names, landmarks, heading order
and stray `tabindex` values on the rendered app.

**Text size and motion.** Settings has a Text size control from 80% to 150%, plus a separate Message text size
for the chat itself. If your system asks for reduced motion, animations and shimmer effects turn off.

## Supported environments

- **Works:** Chromium browsers (Chrome, Edge, Brave and friends) on desktop and Android. Every automated test
  runs in Chromium.
- **Probably works:** Firefox and Safari, desktop and iOS. Orbweaver sticks to standard web features, but the
  test suite doesn't run in them.
- **Unknown:** screen readers end to end. The markup is built for them, but I haven't done a full pass with
  NVDA, JAWS, VoiceOver or TalkBack yet. If you use one, I'd love to hear how it goes.

## Known limitations

- **Forced colors (Windows High Contrast).** Not tested or tuned yet. Text should follow your system colors,
  but custom-drawn pieces like meters and charts may lose meaning.
- **Plugins.** Scripted plugin UI renders through Orbweaver's own components, so it gets the same treatment.
  Custom frames are the plugin author's own HTML, and their accessibility is on the author.
- **It's an alpha.** There are rough edges. Tell me about them.

## Reporting a barrier

Open a [bug report](https://github.com/Inktomi93/orbweaver/issues/new?template=bug.yml) and put "accessibility"
in the title, or email **<studio@inktomi.tech>** if you'd rather not post in public. Say what you were trying to
do, what got in the way, and what you use: browser, device, and any screen reader or other assistive tech.

An accessibility barrier is a bug, not a feature request, and it gets fixed like one.

## For contributors

New UI goes through the same checks: the jsx-a11y lint rules, the theme contrast gate, touch target floors in
the component tests, and the focus-on-arrival gate. If one of them blocks you, fix the markup, not the check.

## Who owns this

Me, the maintainer. Orbweaver is one dude right now, so I read every report and update this page when the
checks or the known limitations change.
