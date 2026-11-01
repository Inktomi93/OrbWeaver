---
kind: adr
status: active
updated: 2026-10-31
---

# Plugins request host owned action placement

## Context

Plugins need contextual actions in the composer, the top bar and other menus. Their server and browser guests do not own the application DOM or host chrome.

## Decision

A plugin declares actions through a typed, closed placement contract. The host owns menu groups, ordering, attribution, keyboard access, mobile overflow, and action invocation. Actions use the existing permission checked plugin command path. Placement is optional. The top bar has no host plugin menu: `topbar` renders one icon button for each placed command, and nothing when no plugin places there. A command with no placement gets no menu or top bar control. The command palette and the `/plugin` slash flow keep it reachable. On a phone the top bar placement renders as rows in the You sheet, beside the palette door. House surfaces remain declarative or scripted data rendered by the host. Custom pixels run only in the consented isolated frame. Admitted bundle assets may be shown through owner scoped asset resolution. Homes: `docs/law/plugin-system.md`, `packages/contracts/src/plugin/` and `PLUGIN_COMMAND_PLACEMENT_TARGETS`. General action placement and frame asset resolution are not yet built.

## Consequences

A plugin can augment supported host menus without editing the DOM. New placement names require a host mount and tests. Frame asset access requires its own scoped delivery path and revocation proof.

## Alternatives rejected

Direct host DOM mutation lets a plugin impersonate application controls and bypass placement policy. Reusing a browser frame for ordinary host actions gives the frame control of chrome it does not own. A free form menu target selector cannot guarantee mounting or accessibility. A host menu that collects unplaced commands spends top bar width on chrome for someone else's extension. Requiring a placement at registration would refuse guests that registered commands without one.
