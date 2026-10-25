# Feature className sites

The sites `orb/feature-classname-layout-only` and `orb/no-built-class-string` report in `packages/client/src/features`, from `pnpm eslint packages/client/src/features`. Each row is one `className`. The migration items are 1334 to 1336 and 1338; the rules are on, so the tree lints red until the last row goes.

## Migration order for datum text

1. Move every machine-text `voice="datum"` site (a payload, an id, a tool name, a macro) to `voice="code"`.
2. Then switch `datum` to the ruled spelling (sans, `tabular-nums`, gloss step), update D5 in `docs/law/UI-Density-Law.md` in the same change, and move the `tabular-nums` rows below onto it.

The props each row maps to are in the Evidence of `docs/work/1340-ui-primitives-for-the-classname-drain.md`.

## Paint on a primitive (271 sites)

By element: Text 98, Row 40, Icon 31, Stack 30, Button 26, ? 9, TrackerValue 6, Card 5, WeaveGlyph 2, TabsList 2, CollapsiblePanel 2, Skeleton 2, Container 2, Separator 2, Badge 2, TabsPanel 1, DialogHeader 1, WebSpinner 1, ThemeScope 1, BackgroundVideo 1, CrossfadeImage 1, TrailingArrow 1, PortraitAvatar 1, Command 1, SandboxFrame 1, Textarea 1, Heading 1.

| file | line | element | paint tokens |
| - | - | - | - |
| `packages/client/src/features/app-shell/components/appearance-density-cards.tsx` | 34 | `Row` | `rounded-control` `bg-accent` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 46 | `Row` | `rounded-control` `border` `border-border` `bg-sidebar` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 48 | `Row` | `border-s-2` `border-sidebar-border` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 49 | `Row` | `border-s-2` `border-sidebar-border` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 62 | `Row` | `rounded-control` `border` `border-border` `bg-background` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 63 | `Row` | `bg-foreground/8` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 64 | `Row` | `bg-foreground/32` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 65 | `Row` | `bg-foreground/60` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 75 | `Row` | `rounded-control` `border` `border-border` `bg-background` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 76 | `Row` | `rounded-inset` `border` `border-sidebar-border` `bg-sidebar` `shadow-overlay` |
| `packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx` | 77 | `Row` | `rounded-inset` `border` `border-sidebar-border` `bg-card` `shadow-overlay` |
| `packages/client/src/features/app-shell/components/boot-veil.tsx` | 133 | `WeaveGlyph` | `text-primary` |
| `packages/client/src/features/app-shell/components/context-bracket.tsx` | 100 | `?` | `border-bs-2` `border-primary/55` |
| `packages/client/src/features/app-shell/components/context-bracket.tsx` | 153 | `TabsPanel` | `bg-sidebar` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 148 | `Stack` | `border-be` `border-border` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 167 | `TabsList` | `border-y-0` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 193 | `Stack` | `via-60%` `to-transparent` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 195 | `Stack` | `text-muted-foreground` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 207 | `Stack` | `via-60%` `to-transparent` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 209 | `Stack` | `text-muted-foreground` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 257 | `TabsList` | `border-be-0` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 286 | `Icon` | `text-muted-foreground` `opacity-60` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 347 | `?` | `data-active:bg-primary/15` `data-active:text-foreground` `border-be-2` `border-transparent` `data-active:border-primary` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 362 | `Icon` | `text-muted-foreground` `opacity-60` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 374 | `Icon` | `opacity-60` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 376 | `Icon` | `opacity-60` |
| `packages/client/src/features/app-shell/components/modal-host.tsx` | 110 | `DialogHeader` | `bg-card` |
| `packages/client/src/features/auth/anchors/login-shell-anchor.tsx` | 57 | `Stack` | `bg-background` `text-foreground` |
| `packages/client/src/features/auth/anchors/login-shell-anchor.tsx` | 69 | `WeaveGlyph` | `text-primary` |
| `packages/client/src/features/auth/surfaces/login-surface.tsx` | 299 | `WebSpinner` | `text-primary` |
| `packages/client/src/features/automation/components/rule-row.tsx` | 294 | `CollapsiblePanel` | `text-foreground` |
| `packages/client/src/features/character/components/character-appearance-tab.tsx` | 355 | `Text` | `text-speaker` |
| `packages/client/src/features/character/components/character-appearance-tab.tsx` | 360 | `Text` | `text-dialogue` |
| `packages/client/src/features/character/components/character-appearance-tab.tsx` | 363 | `Text` | `text-narration` |
| `packages/client/src/features/character/components/character-card.tsx` | 193 | `Icon` | `text-warning` |
| `packages/client/src/features/character/components/character-categorized-list.tsx` | 82 | `Icon` | `transition-transform` `duration-(--motion-base)` `ease-out-expo` |
| `packages/client/src/features/character/components/character-context-band.tsx` | 53 | `Skeleton` | `rounded-base` |
| `packages/client/src/features/character/components/character-context-band.tsx` | 72 | `Text` | `font-mono` |
| `packages/client/src/features/character/components/character-facet-editor.tsx` | 330 | `Stack` | `rounded-base` `border` `border-border` |
| `packages/client/src/features/character/components/character-facet-inspector.tsx` | 213 | `Text` | `tabular-nums` |
| `packages/client/src/features/character/components/character-facet-inspector.tsx` | 253 | `Text` | `tabular-nums` |
| `packages/client/src/features/character/components/character-facet-row.tsx` | 68 | `Button` | `rounded-control` `border` `border-border` `border-l-2` `border-l-primary` `bg-primary/10` `border-l-transparent` |
| `packages/client/src/features/character/components/character-filter-rail-parts.tsx` | 310 | `Button` | `underline` `decoration-dotted` |
| `packages/client/src/features/character/components/character-greeting-preview.tsx` | 200 | `Stack` | `rounded-base` `bg-ai-bubble` `blur-md` `select-none` |
| `packages/client/src/features/character/components/character-hero-band.tsx` | 103 | `Text` | `font-mono` |
| `packages/client/src/features/character/components/character-hero-band.tsx` | 205 | `Button` | `ring-2` |
| `packages/client/src/features/character/components/character-hero-band.tsx` | 261 | `ThemeScope` | `rounded-full` `bg-primary` `ring-1` |
| `packages/client/src/features/character/components/character-library-welcome.tsx` | 285 | `Text` | `rounded-base` `border` `border-border` |
| `packages/client/src/features/character/components/character-library-welcome.tsx` | 336 | `Stack` | `border-bs` `border-border` |
| `packages/client/src/features/character/components/character-shelf-face.tsx` | 112 | `Icon` | `text-warning` |
| `packages/client/src/features/character/components/character-shelf-face.tsx` | 116 | `Text` | `text-foreground` |
| `packages/client/src/features/character/components/character-shelf.tsx` | 46 | `Row` | `border-be` `border-border` |
| `packages/client/src/features/character/surfaces/character-editor-surface.tsx` | 280 | `Text` | `font-mono` `tabular-nums` |
| `packages/client/src/features/chat/components/add-chat-script-dialog.tsx` | 120 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/appearance-chat-style-cards.tsx` | 251 | `Stack` | `text-foreground` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 66 | `Button` | `cursor-pointer` `hover:bg-transparent` `active:bg-transparent` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 89 | `Stack` | `font-medium` `text-primary-foreground` `uppercase` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 124 | `Stack` | `rounded-t-card` `hover:opacity-80` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 167 | `Stack` | `bg-cover` `bg-center` `bg-no-repeat` `group-hover/art:opacity-80` `rounded-tl-card` `rounded-tr-card` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 120 | `Row` | `opacity-50` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 127 | `Text` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 172 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/chat-context-disclosure-section.tsx` | 51 | `CollapsiblePanel` | `text-foreground` |
| `packages/client/src/features/chat/components/chat-controls-band.tsx` | 254 | `Card` | `border` `border-primary/40` |
| `packages/client/src/features/chat/components/chat-controls-band.tsx` | 403 | `Stack` | `rounded-card` `border` `border-border` `bg-card` `text-card-foreground` |
| `packages/client/src/features/chat/components/chat-documents-section.tsx` | 306 | `Row` | `opacity-60` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 153 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 159 | `Icon` | `text-muted-foreground/60` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 164 | `Icon` | `text-warning` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 253 | `?` | `opacity-60` |
| `packages/client/src/features/chat/components/composer-attachment-strip.tsx` | 26 | `BackgroundVideo` | `rounded-base` |
| `packages/client/src/features/chat/components/composer-attachment-strip.tsx` | 33 | `CrossfadeImage` | `rounded-base` |
| `packages/client/src/features/chat/components/composer-drop-target.tsx` | 39 | `Stack` | `rounded-card` `border` `border-border` `bg-card` `focus-within:border-ring/60` `focus-within:bg-muted` `hover:border-input` `hover:bg-muted` `data-drag-over:border-primary` `data-drag-over:bg-muted` `data-drag-over:ring-2` |
| `packages/client/src/features/chat/components/composer-drop-target.tsx` | 57 | `Row` | `rounded-base` `border` `border-primary` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 100 | `Button` | `text-primary` `text-muted-foreground` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 241 | `Button` | `text-primary` `text-muted-foreground` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 304 | `Button` | `text-primary` `text-muted-foreground` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 335 | `Button` | `text-primary` `text-muted-foreground` |
| `packages/client/src/features/chat/components/composer-media-group.tsx` | 88 | `Text` | `contain-inline-size` |
| `packages/client/src/features/chat/components/composer-next-turn-line.tsx` | 65 | `Container` | `bg-card` |
| `packages/client/src/features/chat/components/composer-next-turn-line.tsx` | 80 | `Button` | `underline` |
| `packages/client/src/features/chat/components/composer.tsx` | 400 | `?` | `border-0` `bg-transparent` `focus-visible:ring-0` |
| `packages/client/src/features/chat/components/home-also-open-tile-body.tsx` | 57 | `Row` | `border-bs` `border-border` |
| `packages/client/src/features/chat/components/home-hearth-room.tsx` | 219 | `Text` | `transition-colors` `duration-(--motion-fast)` `ease-out-expo` `group-hover:text-foreground` |
| `packages/client/src/features/chat/components/home-hearth-room.tsx` | 223 | `TrailingArrow` | `transition-transform` `duration-(--motion-fast)` `ease-out-expo` `group-hover:translate-x-tight` |
| `packages/client/src/features/chat/components/home-quick-picks-tile-body.tsx` | 195 | `Text` | `text-foreground` |
| `packages/client/src/features/chat/components/home-quick-picks-tile-body.tsx` | 239 | `Text` | `text-foreground` |
| `packages/client/src/features/chat/components/invite-dialog.tsx` | 288 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/jump-to-latest-pill.tsx` | 38 | `Row` | `rounded-full` `border` `border-border` `bg-popover` `shadow-overlay` `transition-[opacity,translate]` `duration-(--motion-base)` `ease-out-expo` `translate-y-0` `opacity-100` `translate-y-row` `opacity-0` |
| `packages/client/src/features/chat/components/jump-to-latest-pill.tsx` | 47 | `Button` | `text-foreground` |
| `packages/client/src/features/chat/components/member-card-viewer.tsx` | 320 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/member-card-viewer.tsx` | 339 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/member-row.tsx` | 102 | `Text` | `text-muted-foreground` |
| `packages/client/src/features/chat/components/member-row.tsx` | 113 | `Text` | `animate-pulse` |
| `packages/client/src/features/chat/components/member-row.tsx` | 184 | `Text` | `rounded-full` `bg-success` `border` `border-muted-foreground` |
| `packages/client/src/features/chat/components/message-choices-block.tsx` | 58 | `Card` | `bg-info/10` |
| `packages/client/src/features/chat/components/message-choices-block.tsx` | 60 | `Text` | `text-info` |
| `packages/client/src/features/chat/components/message-cost-readout.tsx` | 65 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/message-cost-readout.tsx` | 73 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/message-metadata-row.tsx` | 77 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/message-metadata-row.tsx` | 103 | `Text` | `font-mono` |
| `packages/client/src/features/chat/components/message-name-row-frame.tsx` | 93 | `Row` | `**:data-[slot=message-metadata-timestamp]:text-inherit` `[&_[data-slot=message-attribution]_*]:text-inherit` |
| `packages/client/src/features/chat/components/message-row-avatar.tsx` | 125 | `Button` | `cursor-pointer` `hover:bg-transparent` `hover:opacity-80` `active:bg-transparent` |
| `packages/client/src/features/chat/components/message-row-avatar.tsx` | 151 | `PortraitAvatar` | `rounded-l-none` `rounded-r-card` `rounded-l-card` `rounded-r-none` |
| `packages/client/src/features/chat/components/message-row-divider.tsx` | 15 | `Separator` | `bg-(--color-primary)/35` |
| `packages/client/src/features/chat/components/message-row-divider.tsx` | 22 | `Row` | `rounded-base` `bg-background/80` |
| `packages/client/src/features/chat/components/message-row-divider.tsx` | 29 | `Separator` | `bg-(--color-primary)/35` |
| `packages/client/src/features/chat/components/message-row-header.tsx` | 59 | `Text` | `text-speaker` |
| `packages/client/src/features/chat/components/message-row-parts.tsx` | 214 | `Stack` | `opacity-50` |
| `packages/client/src/features/chat/components/regex-tier-row.tsx` | 116 | `Text` | `tabular-nums` |
| `packages/client/src/features/chat/components/room-flank.tsx` | 58 | `Stack` | `transition-[translate,visibility]` `duration-(--shell-motion)` `ease-(--shell-ease)` `translate-x-0` `translate-x-full` `bg-card` `shadow-overlay` |
| `packages/client/src/features/chat/components/room-overrides-form.tsx` | 78 | `Card` | `border-s-2` `border-s-primary` |
| `packages/client/src/features/chat/surfaces/chat-room-surface.tsx` | 138 | `Stack` | `not-in-data-has-bg-image:bg-background` |
| `packages/client/src/features/chat/surfaces/command-palette-surface.tsx` | 109 | `Command` | `rounded-card` `border` `shadow-overlay` |
| `packages/client/src/features/chat/surfaces/message-list-surface.tsx` | 409 | `Stack` | `bg-muted` `ring-1` |
| `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx` | 232 | `Row` | `border-bs` `border-border` `bg-popover` |
| `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx` | 241 | `Button` | `disabled:opacity-100` `data-disabled:opacity-100` |
| `packages/client/src/features/config/components/appearance-looks-section.tsx` | 233 | `Row` | `rounded-control` `bg-card/80` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 207 | `Text` | `rounded-control` `bg-muted` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 226 | `Text` | `text-speaker` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 230 | `Text` | `text-dialogue` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 233 | `Text` | `text-narration` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 236 | `Text` | `text-prose-body` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 279 | `Text` | `text-warning` |
| `packages/client/src/features/config/components/theme-mini-surface.tsx` | 64 | `Stack` | `bg-background` |
| `packages/client/src/features/config/components/theme-mini-surface.tsx` | 68 | `Row` | `rounded-control` `border` `border-border` `bg-card` |
| `packages/client/src/features/config/components/theme-mini-surface.tsx` | 69 | `Row` | `rounded-full` `bg-foreground` |
| `packages/client/src/features/config/components/theme-mini-surface.tsx` | 73 | `Row` | `rounded-full` `bg-muted-foreground` |
| `packages/client/src/features/config/components/theme-mini-surface.tsx` | 74 | `Row` | `rounded-full` `bg-primary` |
| `packages/client/src/features/credentials/components/add-connection-failure.tsx` | 14 | `Icon` | `text-destructive` |
| `packages/client/src/features/credentials/components/connection-account.tsx` | 107 | `Text` | `text-success` `text-warning` |
| `packages/client/src/features/credentials/components/connection-fact-rows.tsx` | 72 | `Text` | `text-info` |
| `packages/client/src/features/credentials/components/connection-inspector.tsx` | 69 | `Text` | `text-success` `text-warning` |
| `packages/client/src/features/credentials/components/model-picker-typed-field.tsx` | 44 | `Text` | `text-warning` |
| `packages/client/src/features/credentials/components/model-picker-typed-field.tsx` | 59 | `Text` | `text-warning` |
| `packages/client/src/features/discovery/components/corpus-context-header.tsx` | 51 | `Text` | `font-mono` |
| `packages/client/src/features/discovery/components/corpus-duplicate-rows.tsx` | 236 | `Text` | `font-mono` |
| `packages/client/src/features/discovery/components/corpus-family-map.tsx` | 66 | `Card` | `bg-surface-raised` |
| `packages/client/src/features/discovery/components/corpus-gem-tiles.tsx` | 108 | `Text` | `font-mono` |
| `packages/client/src/features/discovery/components/corpus-gem-tiles.tsx` | 116 | `Text` | `text-foreground` |
| `packages/client/src/features/discovery/components/corpus-home-skeleton.tsx` | 62 | `Skeleton` | `rounded-base` |
| `packages/client/src/features/discovery/components/corpus-readiness-rail.tsx` | 94 | `Row` | `border-be` `border-border` `last:border-be-0` |
| `packages/client/src/features/discovery/components/corpus-readiness-rail.tsx` | 102 | `Icon` | `text-primary` `text-muted-foreground` |
| `packages/client/src/features/discovery/components/corpus-readiness-rail.tsx` | 107 | `Text` | `text-muted-foreground` |
| `packages/client/src/features/discovery/surfaces/corpus-dossier-surface.tsx` | 159 | `Text` | `font-mono` |
| `packages/client/src/features/discovery/surfaces/corpus-dossier-surface.tsx` | 335 | `Text` | `font-mono` |
| `packages/client/src/features/home/components/home-tile.tsx` | 113 | `Row` | `border-s` `border-border` |
| `packages/client/src/features/home/components/home-tile.tsx` | 114 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/persona/components/persona-card-pin.tsx` | 49 | `Button` | `text-primary` |
| `packages/client/src/features/persona/components/persona-crown.tsx` | 38 | `Button` | `text-primary` |
| `packages/client/src/features/persona/components/persona-crown.tsx` | 55 | `Text` | `text-primary` |
| `packages/client/src/features/persona/components/persona-editor.tsx` | 92 | `Stack` | `rounded-base` `border` `border-border` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 72 | `Row` | `rounded-control` `transition-colors` `duration-(--motion-fast)` `ease-out-expo` `hover:bg-accent` `data-expanded:bg-accent` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 85 | `Button` | `rounded-control` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 167 | `Button` | `text-destructive` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 179 | `Text` | `text-destructive` |
| `packages/client/src/features/persona/components/persona-switch-list.tsx` | 152 | `Row` | `rounded-control` `transition-colors` `duration-(--motion-fast)` `ease-out-expo` `hover:not-data-selected:bg-accent/50` `data-selected:bg-accent` |
| `packages/client/src/features/persona/components/persona-switch-list.tsx` | 203 | `Button` | `rounded-control` |
| `packages/client/src/features/plugin/components/plugin-frame.tsx` | 160 | `SandboxFrame` | `rounded-base` `border` `border-border` `bg-card` |
| `packages/client/src/features/plugin/components/plugin-install-source-identity.tsx` | 23 | `Text` | `select-all` |
| `packages/client/src/features/plugin/components/plugin-install-source-identity.tsx` | 29 | `Text` | `select-all` |
| `packages/client/src/features/plugin/components/plugin-leaf-nodes.tsx` | 263 | `Stack` | `rounded-base` `border` `border-border` |
| `packages/client/src/features/plugin/components/plugin-row-leaves.tsx` | 251 | `Stack` | `border-s-2` `border-s-warning` |
| `packages/client/src/features/plugin/components/plugin-row.tsx` | 181 | `Stack` | `border-be` `border-border` |
| `packages/client/src/features/plugin/components/plugin-surface-shell.tsx` | 67 | `Row` | `border-be` `border-border` `bg-card/40` |
| `packages/client/src/features/plugin/components/plugin-surface-shell.tsx` | 73 | `Text` | `text-foreground` |
| `packages/client/src/features/plugin/components/plugin-surface-shell.tsx` | 117 | `Text` | `text-foreground` |
| `packages/client/src/features/plugin/components/snippet-console.tsx` | 83 | `Textarea` | `font-mono` |
| `packages/client/src/features/preset/components/actions-view.tsx` | 140 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/preset/components/capability-gate.tsx` | 89 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/macro-text.tsx` | 61 | `Text` | `rounded-base` `border` `border-border` `bg-muted/40` |
| `packages/client/src/features/preset/components/preset-editor-header.tsx` | 89 | `Stack` | `bg-card` |
| `packages/client/src/features/preset/components/preset-import-dialog.tsx` | 204 | `Row` | `text-destructive` |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx` | 137 | `Button` | `rounded-control` |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-rack.tsx` | 118 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-rack.tsx` | 131 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/prompt-assembly/pivot-band.tsx` | 32 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/prompt-assembly/pivot-band.tsx` | 48 | `Text` | `text-info` |
| `packages/client/src/features/preset/components/prompt-assembly/section-row.tsx` | 158 | `Text` | `font-mono` `tabular-nums` `line-through` |
| `packages/client/src/features/preset/components/prompt-assembly/section-row.tsx` | 180 | `Icon` | `opacity-60` |
| `packages/client/src/features/preset/components/readout/prompt-readout.tsx` | 289 | `Text` | `line-through` |
| `packages/client/src/features/preset/components/readout/prompt-readout.tsx` | 309 | `Text` | `line-through` |
| `packages/client/src/features/preset/components/readout/readout-parts.tsx` | 179 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/staleness-row.tsx` | 86 | `Row` | `text-warning` |
| `packages/client/src/features/preset/components/template-drill-in.tsx` | 386 | `Badge` | `font-mono` |
| `packages/client/src/features/preset/components/template-drill-in.tsx` | 398 | `Row` | `text-warning` |
| `packages/client/src/features/refinery/components/accept-review.tsx` | 165 | `Row` | `border-bs` `border-border` `first:border-bs-0` |
| `packages/client/src/features/refinery/components/lane-run-control.tsx` | 136 | `Container` | `rounded-full` `bg-primary/30` |
| `packages/client/src/features/refinery/components/payload-view.tsx` | 132 | `Stack` | `opacity-60` `transition-opacity` `duration-(--motion-base)` `ease-out-expo` |
| `packages/client/src/features/refinery/components/refinery-chip.tsx` | 47 | `Text` | `rounded-full` |
| `packages/client/src/features/refinery/components/schema-editor-panes.tsx` | 48 | `Text` | `text-warning` |
| `packages/client/src/features/regex/components/regex-pipeline-panel.tsx` | 211 | `Badge` | `tracking-normal` `normal-case` |
| `packages/client/src/features/roster-preset/components/roster-picker.tsx` | 82 | `Stack` | `border-be` `border-border` `last:border-be-0` |
| `packages/client/src/features/rpg/components/rpg-act-rail.tsx` | 72 | `Text` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-act-rail.tsx` | 77 | `Text` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-act-rail.tsx` | 92 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-beat-row.tsx` | 51 | `Text` | `uppercase` |
| `packages/client/src/features/rpg/components/rpg-card-row.tsx` | 49 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 54 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 75 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 133 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 149 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-choice-echo.tsx` | 89 | `Text` | `text-info` |
| `packages/client/src/features/rpg/components/rpg-choice-echo.tsx` | 91 | `Text` | `tracking-normal` |
| `packages/client/src/features/rpg/components/rpg-dice-tool-card.tsx` | 63 | `Card` | `border` `border-border` |
| `packages/client/src/features/rpg/components/rpg-field-lock.tsx` | 32 | `Button` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-freshness-indicator.tsx` | 95 | `Icon` | `animate-pulse` |
| `packages/client/src/features/rpg/components/rpg-game-door.tsx` | 82 | `Icon` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-game-door.tsx` | 83 | `Text` | `tracking-micro` `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-game-door.tsx` | 99 | `Icon` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-game-door.tsx` | 100 | `Text` | `tracking-micro` `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx` | 134 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx` | 397 | `Icon` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx` | 398 | `Text` | `tracking-micro` `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-header-band.tsx` | 51 | `Button` | `font-medium` `text-accolade` `hover:text-accolade` |
| `packages/client/src/features/rpg/components/rpg-journal-tab.tsx` | 250 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-kicker.tsx` | 33 | `Heading` | `text-accolade` |
| `packages/client/src/features/rpg/components/rpg-map-tab.tsx` | 22 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-pack-fields.tsx` | 63 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-pack-fields.tsx` | 85 | `?` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 66 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 112 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 124 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 165 | `Row` | `rounded-control` `border` `border-border` `bg-card` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 184 | `Button` | `rounded-control` `border` `border-border` `bg-card` |
| `packages/client/src/features/rpg/components/rpg-quests-tab.tsx` | 79 | `Text` | `line-through` |
| `packages/client/src/features/rpg/components/rpg-quests-tab.tsx` | 103 | `Text` | `text-muted-foreground` `line-through` |
| `packages/client/src/features/rpg/components/rpg-quests-tab.tsx` | 169 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-quests-tab.tsx` | 203 | `Text` | `text-muted-foreground` `line-through` |
| `packages/client/src/features/rpg/components/rpg-scene-npcs.tsx` | 103 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-scene-tab.tsx` | 305 | `Button` | `border` `border-transparent` |
| `packages/client/src/features/rpg/components/rpg-scene-tab.tsx` | 342 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-stat-profile-editor.tsx` | 49 | `Stack` | `rounded-base` `border` `border-border` `bg-card` |
| `packages/client/src/features/rpg/components/rpg-stat-profile-editor.tsx` | 108 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-stat-profile-editor.tsx` | 126 | `TrackerValue` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-status-tab.tsx` | 212 | `Button` | `font-medium` |
| `packages/client/src/features/rpg/components/rpg-status-tab.tsx` | 219 | `Icon` | `text-muted-foreground` |
| `packages/client/src/features/rpg/components/rpg-subject-select.tsx` | 39 | `?` | `font-semibold` |
| `packages/client/src/features/rpg/components/rpg-takeover-header.tsx` | 129 | `Stack` | `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-turn-ref.tsx` | 35 | `Text` | `font-mono` `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-turn-ref.tsx` | 42 | `Text` | `font-mono` `tabular-nums` |
| `packages/client/src/features/rpg/components/rpg-veiled-section.tsx` | 66 | `Text` | `text-accolade` |
| `packages/client/src/features/rpg/components/tracker-blocks/ambient-strip.tsx` | 79 | `Button` | `border` `border-transparent` |
| `packages/client/src/features/rpg/components/tracker-blocks/ambient-strip.tsx` | 151 | `Button` | `border-bs` `border-border` |
| `packages/client/src/features/rpg/components/tracker-blocks/ambient-strip.tsx` | 182 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/hint-editor.tsx` | 43 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/meter-row.tsx` | 71 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/meter-row.tsx` | 97 | `?` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/meter-row.tsx` | 143 | `?` | `text-warning` `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/meter-row.tsx` | 254 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 46 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 76 | `?` | `text-title` `leading-title` `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 80 | `Text` | `tracking-micro` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 151 | `Text` | `opacity-50` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 186 | `Text` | `text-muted-foreground` `line-through` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-blocks.tsx` | 193 | `Text` | `tabular-nums` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-value.tsx` | 92 | `Button` | `border` `border-transparent` |
| `packages/client/src/features/stats/components/analytics-models-tab.tsx` | 98 | `Text` | `font-mono` |
| `packages/client/src/features/stats/components/analytics-personas-tab.tsx` | 70 | `Text` | `font-mono` |
| `packages/client/src/features/stats/surfaces/analytics-list-surface.tsx` | 179 | `Text` | `font-mono` `tabular-nums` |
| `packages/client/src/features/stats/surfaces/analytics-list-surface.tsx` | 186 | `Text` | `font-mono` |
| `packages/client/src/features/stats/surfaces/analytics-overview-surface.tsx` | 179 | `Text` | `font-mono` |
| `packages/client/src/features/user-admin/components/share-card.tsx` | 274 | `Text` | `font-mono` |
| `packages/client/src/features/user-admin/components/share-card.tsx` | 304 | `Text` | `font-mono` |
| `packages/client/src/features/user-admin/components/share-ip-certificate.tsx` | 93 | `Text` | `font-mono` |
| `packages/client/src/features/user-admin/components/share-preconditions.tsx` | 265 | `Text` | `font-mono` |
| `packages/client/src/features/user-admin/components/sharing-posture.tsx` | 114 | `Text` | `font-mono` |
| `packages/client/src/features/workloads/components/import-library-section.tsx` | 89 | `Stack` | `rounded-control` `border` `border-input` |
| `packages/client/src/features/workloads/components/import-report-summary.tsx` | 30 | `Text` | `font-semibold` |
| `packages/client/src/features/workloads/components/import-report-summary.tsx` | 48 | `Icon` | `text-success` `text-destructive` |
| `packages/client/src/features/workloads/components/import-report-summary.tsx` | 51 | `Text` | `font-mono` |

## Built class strings (131 sites)

By kind: template 46, imported constant 46, member read 19, function builder 16, concatenation 4.

| file | line | kind | source |
| - | - | - | - |
| `packages/client/src/features/app-shell/components/context-bracket.tsx` | 153 | template | `className={'relative flex-initial overflow-y-auto overscroll-contain p-row min-block-0 …` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 148 | template | `className={'shrink-0 border-be border-border min-inline-0 ${RAIL_OWNERSHIP_CLASSES[owne…` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 167 | template | `className={'grid inline-full min-inline-0 ${RAIL_TRACK_CLASSES} grid-flow-col gap-tight…` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 193 | template | `className={'pointer-events-none absolute inset-y-0 inset-s-0 bg-linear-to-r inline-gutt…` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 207 | template | `className={'pointer-events-none absolute inset-y-0 inset-e-0 bg-linear-to-l inline-gutt…` |
| `packages/client/src/features/app-shell/components/context-rail.tsx` | 347 | template | `className={'relative data-active:bg-primary/15 data-active:text-foreground ${CELL_EDGE_…` |
| `packages/client/src/features/app-shell/components/rail-button.tsx` | 70 | template | `className={'shell-rail-button ${FOCUS_RING_ON_SIDEBAR}'}` |
| `packages/client/src/features/app-shell/components/rail.tsx` | 104 | template | `className={'shell-rail-brand shell-rail-brand-button ${FOCUS_RING_ON_SIDEBAR}'}` |
| `packages/client/src/features/app-shell/components/shell-topbar.tsx` | 79 | template | `className={marker === undefined ? "shell-topbar-icon-btn" : 'shell-topbar-icon-btn ${ma…` |
| `packages/client/src/features/app-shell/components/theme-background-video-layer.tsx` | 45 | member read | `<BackgroundVideo src={url} paused={appReducedMotion} className={OBJECT_FIT_CLASS_BY_FIT…` |
| `packages/client/src/features/auth/components/login-transport-notice.tsx` | 35 | member read | `<Text voice="label" className={notice.tone} data-client-scope={clientScope} data-testid…` |
| `packages/client/src/features/character/components/character-card.tsx` | 193 | template | `{character.starred ? <Icon className={'text-warning ${ROW_REVEAL_SWAP_COARSE_KEEP}'} ic…` |
| `packages/client/src/features/character/components/character-card.tsx` | 259 | imported constant | `<Row align="center" className={ROW_ACTION_INLINE}>` |
| `packages/client/src/features/character/components/character-card.tsx` | 277 | imported constant | `className={ROW_REVEAL}` |
| `packages/client/src/features/character/components/character-card.tsx` | 309 | imported constant | `<MenuItem className={ROW_ACTION_OVERFLOW} onClick={(): void => onToggleStar(character.i…` |
| `packages/client/src/features/character/components/character-create-actions.tsx` | 239 | imported constant | `<Button className={RECEDED_INK} intent="ghost" onClick={(): void => setImportOpen(true)…` |
| `packages/client/src/features/character/components/character-create-actions.tsx` | 266 | imported constant | `<Button aria-label="Import a character card" className={RECEDED_INK} intent="ghost" onC…` |
| `packages/client/src/features/character/components/character-facet-editor.tsx` | 207 | function builder | `<Stack gap="field" data-slot="character-spoiler-field" className={spoilerClass(spoilerB…` |
| `packages/client/src/features/character/components/character-facet-editor.tsx` | 281 | function builder | `<Stack gap="field" data-slot="character-spoiler-field" className={editing ? undefined :…` |
| `packages/client/src/features/character/components/character-facet-row.tsx` | 68 | template | `className={'justify-start gap-row text-start inline-full min-inline-0 ${rowClass}'}` |
| `packages/client/src/features/character/components/character-filter-chips.tsx` | 228 | imported constant | `<Toggle aria-label={name} className={RECEDED_INK} intent="outline" onPressedChange={onT…` |
| `packages/client/src/features/character/components/character-filter-rail-parts.tsx` | 202 | imported constant | `<Text as="span" className={SHOW_ONLY_AT_COARSE}>` |
| `packages/client/src/features/character/components/character-filter-rail-parts.tsx` | 241 | member read | `className={cn("min-w-0 max-w-full", presentation.restingInk) ?? ""}` |
| `packages/client/src/features/character/components/character-filter-rail-parts.tsx` | 310 | template | `className={'${RECEDED_INK} underline decoration-dotted'}` |
| `packages/client/src/features/character/components/character-hero-band.tsx` | 103 | template | `<Text voice="gloss" className={'truncate font-mono ${HERO_ECHO_CLASS}'}>` |
| `packages/client/src/features/character/surfaces/character-editor-surface.tsx` | 280 | template | `className={'font-mono tabular-nums ${HERO_ECHO_CLASS}'}` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 124 | concatenation | `className={cn("relative rounded-t-card", tappable && "hover:opacity-80", band.className)}` |
| `packages/client/src/features/chat/components/art-slot.tsx` | 167 | concatenation | `className={cn("absolute inset-0 bg-cover bg-center bg-no-repeat", tappable && "group-ho…` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 108 | imported constant | `className={cn("flex-wrap px-block py-row", BG_PHOTO_BAND_PLATE)}` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 120 | member read | `className={cn(member.disabled && "opacity-50")}` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 127 | member read | `<Text as="span" className={cn("sr-only", member.disabled && "text-muted-foreground")} v…` |
| `packages/client/src/features/chat/components/chat-character-bar.tsx` | 165 | imported constant | `<Text as="span" className={LABEL_TO_SR_ONLY_AT_COARSE} voice="label">` |
| `packages/client/src/features/chat/components/chat-header.tsx` | 145 | template | `className={'shell-chat-member-chip shrink-0 whitespace-nowrap ${CHIP_TOUCH_WIDTH_FLOOR_…` |
| `packages/client/src/features/chat/components/chat-list-month-filter.tsx` | 75 | template | `<Input className={'flex-1 min-inline-0 ${CLEAR_INSET_RESERVE}'} onValueChange={setChatL…` |
| `packages/client/src/features/chat/components/chat-recall-indicator.tsx` | 131 | template | `className={'shrink-0 whitespace-nowrap ${CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE}'}` |
| `packages/client/src/features/chat/components/chat-recall-indicator.tsx` | 136 | function builder | `<Icon icon={BrainCircuit} size="sm" className={iconClass(recall)} />` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 164 | imported constant | `{chat.starred ? <Icon className={cn("text-warning", interactive && ROW_REVEAL_SWAP_COAR…` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 222 | imported constant | `<Row align="center" className={ROW_ACTION_INLINE}>` |
| `packages/client/src/features/chat/components/chat-summary-row.tsx` | 253 | member read | `className={cn(className, chat.archived && "opacity-60") ?? ""}` |
| `packages/client/src/features/chat/components/composer-arg-hint-strip.tsx` | 45 | imported constant | `return <OptionStrip aria-label="Command arguments" className={CHAT_TRACK} id={SLASH_ARG…` |
| `packages/client/src/features/chat/components/composer-attachment-strip.tsx` | 55 | imported constant | `<Row gap="field" align="center" data-slot="composer-attachments" className={cn(CHAT_TRA…` |
| `packages/client/src/features/chat/components/composer-drop-target.tsx` | 39 | imported constant | `className={cn(` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 100 | template | `className={hasText && !disabled ? STEERING_CONTROL_CLASS : RESTING_CONTROL_CLASS}` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 241 | template | `className={hasText && !disabled ? STEERING_CONTROL_CLASS : RESTING_CONTROL_CLASS}` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 304 | template | `className={hasText ? STEERING_CONTROL_CLASS : RESTING_CONTROL_CLASS}` |
| `packages/client/src/features/chat/components/composer-guided-buttons.tsx` | 335 | template | `className={hasText ? STEERING_CONTROL_CLASS : RESTING_CONTROL_CLASS}` |
| `packages/client/src/features/chat/components/composer-guided-cluster.tsx` | 256 | imported constant | `<Text as="span" className={SHOW_ONLY_AT_COARSE} data-slot="composer-guided-refusal" voi…` |
| `packages/client/src/features/chat/components/composer-next-turn-line.tsx` | 65 | imported constant | `<Container className={cn(CHAT_TRACK, "bg-card py-tight")}>` |
| `packages/client/src/features/chat/components/composer-next-turn-line.tsx` | 69 | member read | `className={cn("px-field wrap-break-word max-inline-(--reading-measure-prose) min-inline…` |
| `packages/client/src/features/chat/components/composer-send-control.tsx` | 97 | function builder | `className={sendClass(props.hasDraft && !props.sendDisabled)}` |
| `packages/client/src/features/chat/components/composer-slash-strip.tsx` | 70 | imported constant | `<Stack gap="field" data-slot="composer-slash-strip" className={CHAT_TRACK}>` |
| `packages/client/src/features/chat/components/generation-credit.tsx` | 27 | imported constant | `<Text as="span" voice="gloss" className={cn("inline-flex items-center", HIDE_AT_COARSE)…` |
| `packages/client/src/features/chat/components/generation-credit.tsx` | 28 | imported constant | `<Icon aria-hidden={true} className={MESSAGE_ACTION_ICON_CLASS} icon={Cpu} size="sm" />` |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 381 | function builder | `className={cn(skin.outer("assistant"), enterClasses)}` |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 388 | function builder | `<Row align="start" gap="row" data-slot="message-row-body" className={cn(rowBodyClassFor…` |
| `packages/client/src/features/chat/components/ghost-message-row.tsx` | 392 | function builder | `<Stack gap="row" data-slot="message-content-column" className={columnClass} style={skin…` |
| `packages/client/src/features/chat/components/greeting-swipe-strip.tsx` | 91 | member read | `className={foot.chevron}` |
| `packages/client/src/features/chat/components/greeting-swipe-strip.tsx` | 101 | imported constant | `<Text as="span" voice="datum" aria-hidden="true" data-slot="greeting-swipe-strip-counte…` |
| `packages/client/src/features/chat/components/greeting-swipe-strip.tsx` | 109 | member read | `className={foot.chevron}` |
| `packages/client/src/features/chat/components/jump-to-latest-pill.tsx` | 38 | template | `<Row align="center" className={pillClasses}>` |
| `packages/client/src/features/chat/components/member-row.tsx` | 244 | imported constant | `<Row gap="field" align="center" className={cn(ROW_REVEAL, HIDE_AT_COARSE) ?? ""}>` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 53 | imported constant | `<Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 59 | imported constant | `className={ROW_ACTION_INLINE}` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 64 | imported constant | `<Icon className={MESSAGE_ACTION_ICON_CLASS} icon={GitFork} size="sm" />` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 75 | imported constant | `<Button aria-label={MESSAGE_REACTION_ADD_NAME} className={ROW_ACTION_INLINE} intent="gh…` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 76 | imported constant | `<Icon className={MESSAGE_ACTION_ICON_CLASS} icon={SmilePlus} size="sm" />` |
| `packages/client/src/features/chat/components/message-actions-cluster.tsx` | 107 | template | `<Row aria-hidden="true" align="center" className={'invisible ${surface}'} data-slot="me…` |
| `packages/client/src/features/chat/components/message-actions-row.tsx` | 271 | template | `className={'${messageActionsRevealClass(messageActions)} ${surface}'}` |
| `packages/client/src/features/chat/components/message-name-row-frame.tsx` | 93 | member read | `className={cn(` |
| `packages/client/src/features/chat/components/message-row-avatar.tsx` | 151 | concatenation | `className={` |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 50 | function builder | `<Stack data-slot="message-bubble" className={withoutBubblePadding(args.bubbleClassName)…` |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 63 | member read | `<Stack gap="row" data-slot="message-bubble" className={cn(args.bubbleClassName, art !==…` |
| `packages/client/src/features/chat/components/message-row-bubble.tsx` | 72 | function builder | `<Row align="start" data-slot="message-bubble" className={withoutBubblePadding(args.bubb…` |
| `packages/client/src/features/chat/components/message-row-parts.tsx` | 214 | function builder | `className={bubbleClassName}` |
| `packages/client/src/features/chat/components/message-row.tsx` | 370 | function builder | `className={cn("group", skin.outer(role), enterClasses)}` |
| `packages/client/src/features/chat/components/message-row.tsx` | 380 | function builder | `<Row align="start" className={cn(rowBodyClassFor(skin), ROW_BODY_AT_PHONE_WIDTH)} gap="…` |
| `packages/client/src/features/chat/components/message-row.tsx` | 392 | function builder | `className={columnClass}` |
| `packages/client/src/features/chat/components/message-row.tsx` | 434 | imported constant | `<Stack gap="field" data-slot="message-footer" className={cn("empty:hidden", BG_PHOTO_CH…` |
| `packages/client/src/features/chat/components/message-tool-calls.tsx` | 53 | imported constant | `<Row gap="field" className={INERT_UNTIL_HOVER}>` |
| `packages/client/src/features/chat/components/room-flank.tsx` | 58 | member read | `className={cn(` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 68 | member read | `<Row align="center" justify="end" gap="tight" data-slot={props.slot} className={props.f…` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 140 | member read | `className={foot.chevron}` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 152 | imported constant | `<Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" classN…` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 161 | member read | `className={foot.chevron}` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 186 | member read | `<Row align="center" justify="end" data-slot="swipe-count" className={foot.row}>` |
| `packages/client/src/features/chat/components/swipe-strip.tsx` | 187 | imported constant | `<Text as="span" voice="datum" aria-hidden="true" data-slot="swipe-strip-counter" classN…` |
| `packages/client/src/features/chat/surfaces/chat-list-surface.tsx` | 198 | template | `className={'flex-1 min-inline-0 ${CLEAR_INSET_RESERVE}'}` |
| `packages/client/src/features/chat/surfaces/chat-room-surface.tsx` | 138 | concatenation | `className={cn(` |
| `packages/client/src/features/chat/surfaces/chat-room-surface.tsx` | 240 | imported constant | `<Stack gap="row" className={cn(CHAT_TRACK, "empty:hidden")} data-slot="chat-above-compo…` |
| `packages/client/src/features/chat/surfaces/chat-room-surface.tsx` | 265 | template | `<Stack className={'${CHAT_TRACK} ${BG_PHOTO_LOADING_PLATE}'}>` |
| `packages/client/src/features/chat/surfaces/message-list-surface.tsx` | 119 | template | `<Stack className={'${CHAT_TRACK} ${BG_PHOTO_LOADING_PLATE}'} data-slot="transcript-load…` |
| `packages/client/src/features/chat/surfaces/message-list-surface.tsx` | 133 | template | `<QueryErrorState className={'${CHAT_TRACK} ${BG_PHOTO_ERROR_PLATE}'} label="this conver…` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 229 | function builder | `<Stack gap="field" className={messageBubbleClass("assistant")}>` |
| `packages/client/src/features/config/components/theme-editor.tsx` | 240 | template | `<Stack gap="field" className={'self-end ${messageBubbleClass("user")}'}>` |
| `packages/client/src/features/discovery/components/corpus-hit-rows.tsx` | 82 | template | `className={'justify-start max-inline-full ${RECEDED_INK}'}` |
| `packages/client/src/features/discovery/components/corpus-readiness-rail.tsx` | 209 | imported constant | `<Button className={RECEDED_INK} data-slot="readiness-jobs-door" intent="ghost" onClick=…` |
| `packages/client/src/features/home/surfaces/home-surface.tsx` | 151 | template | `className={'${SCROLL_FADE_Y_CLASS} relative overflow-y-auto overscroll-contain px-secti…` |
| `packages/client/src/features/persona/components/persona-card-pin.tsx` | 49 | imported constant | `className={cn("relative shrink-0", isPinned ? "text-primary" : cn(PIN_REVEAL, HIDE_AT_C…` |
| `packages/client/src/features/persona/components/persona-crown.tsx` | 38 | imported constant | `className={cn("relative shrink-0", isDefault ? "text-primary" : PIN_REVEAL, HIDE_AT_COA…` |
| `packages/client/src/features/persona/components/persona-crown.tsx` | 55 | imported constant | `<Text as="span" aria-label={DEFAULT_MARKER_LABEL} className={cn("relative shrink-0 text…` |
| `packages/client/src/features/persona/components/persona-editor.tsx` | 92 | template | `className={'rounded-base border border-border p-block outline-none ${FOCUS_RING}'}` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 123 | imported constant | `<Row align="center" className={cn("relative shrink-0", ROW_ACTION_OVERFLOW) ?? ""}>` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 167 | imported constant | `className={cn("relative shrink-0", starred ? "text-destructive" : PIN_REVEAL, HIDE_AT_C…` |
| `packages/client/src/features/persona/components/persona-panel-row.tsx` | 179 | imported constant | `<Text as="span" aria-label="Favorited" className={cn("relative shrink-0 text-destructiv…` |
| `packages/client/src/features/persona/components/persona-switch-list.tsx` | 152 | template | `className={room === null ? STATIC_ROW : SWITCH_ROW}` |
| `packages/client/src/features/persona/components/persona-switch-list.tsx` | 168 | imported constant | `<Row align="center" className={cn("relative shrink-0", ROW_ACTION_OVERFLOW) ?? ""}>` |
| `packages/client/src/features/persona/components/persona-switch-list.tsx` | 274 | imported constant | `className={cn(PIN_REVEAL, HIDE_AT_COARSE, "relative shrink-0") ?? ""}` |
| `packages/client/src/features/preset/components/macro-text.tsx` | 61 | template | `<Text className={frame === "quoted" ? '${RUN_FLOW} ${QUOTED_FRAME}' : RUN_FLOW} prose={…` |
| `packages/client/src/features/preset/components/preset-editor-header.tsx` | 205 | template | `<Row className={'${SCROLL_FADE_X_CLASS} overflow-x-auto py-tight min-inline-0'} ref={st…` |
| `packages/client/src/features/preset/components/prompt-assembly/section-row.tsx` | 158 | template | `className={'shrink-0 text-end font-mono tabular-nums inline-(--width-number-inline) ${s…` |
| `packages/client/src/features/refinery/components/context-tabs.tsx` | 146 | imported constant | `<Button className={RECEDED_INK} intent="ghost" onClick={onRunScore} size="sm">` |
| `packages/client/src/features/refinery/components/payload-view.tsx` | 176 | member read | `<Card className={BANNER_TONE_CLASSES[tone] ?? ""} data-testid={testId("refineryVerdictB…` |
| `packages/client/src/features/refinery/components/refinery-chip.tsx` | 47 | template | `className={'inline-flex items-center rounded-full px-field ${TONE_CLASSES[tone]}'}` |
| `packages/client/src/features/refinery/components/schema-editor-panes.tsx` | 48 | function builder | `className={cn(PLAN_LINE_MEASURE, REFINERY_SCHEMA_PLAN_FAILING.has(plan.outcome) && "tex…` |
| `packages/client/src/features/regex/components/regex-pipeline-panel.tsx` | 185 | function builder | `<Text className={statusInk(stage)} voice="gloss">` |
| `packages/client/src/features/rpg/components/rpg-act-rail.tsx` | 53 | member read | `<Text as="span" voice="gloss" className={style.className}>` |
| `packages/client/src/features/rpg/components/rpg-actor-trackers.tsx` | 265 | template | `<Row gap="field" align="center" className={'min-inline-0 ${VALUE_ROW_TOUCH_FLOOR_AT_COA…` |
| `packages/client/src/features/rpg/components/rpg-actor-trackers.tsx` | 309 | template | `<Row gap="field" className={'flex-wrap ${VALUE_ROW_TOUCH_FLOOR_AT_COARSE}'} data-slot="…` |
| `packages/client/src/features/rpg/components/rpg-actor-trackers.tsx` | 324 | imported constant | `<Badge key={cond.name} tone="soft" size="sm" intent="danger" className={CHIP_TOUCH_FLOO…` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 100 | template | `<Row className={'min-inline-0 ${VALUE_ROW_TOUCH_FLOOR_AT_COARSE}'}>` |
| `packages/client/src/features/rpg/components/rpg-character-detail.tsx` | 427 | template | `<Row gap="field" align="center" className={'min-inline-0 ${VALUE_ROW_TOUCH_FLOOR_AT_COA…` |
| `packages/client/src/features/rpg/components/rpg-game-tab.tsx` | 104 | imported constant | `<Stack gap="field" rows="control" className={DEF_ROW_CLASS} data-slot="rpg-tracker-row">` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 45 | imported constant | `<Row gap="field" className={cn("max-w-(--width-control-col) flex-wrap", PICKER_GAP_AT_C…` |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` | 184 | template | `className={'whitespace-normal ${TILE_CLASS}'}` |
| `packages/client/src/features/rpg/components/rpg-satellite-row.tsx` | 84 | imported constant | `<Row gap="block" align="start" className={cn("min-w-0 overflow-x-auto", HIDE_AT_COARSE)…` |
| `packages/client/src/features/rpg/components/tracker-blocks/meter-row.tsx` | 247 | imported constant | `<Stack gap="field" className={VALUE_ROW_TOUCH_FLOOR_AT_COARSE} data-slot="meter-row" da…` |
| `packages/client/src/features/rpg/components/tracker-blocks/npc-card-slots.tsx` | 131 | member read | `<Text as="span" size="label" tone="muted" className={GUIDE_CLASS[field]}>` |
| `packages/client/src/features/rpg/components/tracker-blocks/npc-card-slots.tsx` | 142 | template | `className={'field-sizing-content max-inline-full ${GUIDE_CLASS[field]}'}` |
| `packages/client/src/features/rpg/components/tracker-blocks/tracker-value.tsx` | 92 | template | `className={'gap-0 border border-transparent px-field text-start ${className}'}` |
| `packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx` | 91 | template | `<CollapsibleTrigger className={'inline-full ${DISCLOSURE_TOUCH_FLOOR_AT_COARSE}'} size=…` |
| `packages/client/src/features/workloads/components/persona-collision-review.tsx` | 57 | template | `className={'wrap-break-word whitespace-pre-wrap max-inline-(--reading-measure-prose) ${…` |
