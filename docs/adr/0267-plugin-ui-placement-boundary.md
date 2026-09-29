---
kind: adr
status: active
updated: 2026-09-28
---

# Plugins request host owned action placement

## Context

Plugins need contextual actions in the composer and other menus. Their server and browser guests do not own the application DOM or host chrome.

## Decision

A plugin declares actions through a typed, closed placement contract. The host owns menu groups, ordering, attribution, keyboard access, mobile overflow, and action invocation. Actions use the existing permission checked plugin command path. House surfaces remain declarative or scripted data rendered by the host. Custom pixels run only in the consented isolated frame. Admitted bundle assets may be shown through owner scoped asset resolution. Homes: `docs/law/plugin-system.md`, `packages/contracts/src/plugin/`, and `docs/plans/plugin-authoring/design.md`. General action placement and frame asset resolution are not yet built.

## Consequences

A plugin can augment supported host menus without editing the DOM. New placement names require a host mount and tests. Frame asset access requires its own scoped delivery path and revocation proof.

## Alternatives rejected

Direct host DOM mutation lets a plugin impersonate application controls and bypass placement policy. Reusing a browser frame for ordinary host actions gives the frame control of chrome it does not own. A free form menu target selector cannot guarantee mounting or accessibility.
