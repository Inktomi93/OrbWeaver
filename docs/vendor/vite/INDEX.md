# Vite docs mirror — v8 (8.2.x line)

Verbatim snapshot of the upstream Vite documentation (`vite.dev/**.md`), fetched 2026-08-07 from the
page list at `https://vite.dev/llms.txt`. **Reference only — never edit these files; re-fetch on a
version bump.**

Versioning: the site documents the current major, **Vite 8** (Rolldown-based; the migration guide is
"Migration from v7"). At fetch time the latest published release was `vite@8.2.1`. The repo's
pnpm-workspace catalog pins `vite: ^8.1.2` — same major, no version gap; minor drift (8.1 → 8.2)
only.

Layout mirrors the site's URL paths. Every page listed by llms.txt was fetched and served markdown
directly — no failures, no HTML-only pages. `config.md` is listed twice upstream (under both "APIs"
and "Config"); it is vendored once. Total ~418 KiB across 42 pages.

## Introduction

- `guide.md` — Getting Started (scaffolding, CLI basics, index.html handling)
- `guide/philosophy.md` — Project Philosophy
- `guide/why.md` — Why Vite

## Guide

- `guide/features.md` — Features (HMR, TS, CSS, JSON, glob import, workers, …)
- `guide/cli.md` — Command Line Interface
- `guide/using-plugins.md` — Using Plugins
- `guide/dep-pre-bundling.md` — Dependency Pre-Bundling
- `guide/assets.md` — Static Asset Handling
- `guide/build.md` — Building for Production
- `guide/static-deploy.md` — Deploying a Static Site
- `guide/env-and-mode.md` — Env Variables and Modes
- `guide/ssr.md` — Server-Side Rendering (SSR)
- `guide/backend-integration.md` — Backend Integration
- `guide/troubleshooting.md` — Troubleshooting
- `guide/performance.md` — Performance
- `guide/migration.md` — Migration from v7 (the v8 breaking-change list)
- `changes.md` — Breaking Changes index (current/future/past deprecations)

## APIs

- `guide/api-plugin.md` — Plugin API
- `guide/api-hmr.md` — HMR API
- `guide/api-javascript.md` — JavaScript API
- `config.md` — Configuring Vite (config file resolution, intellisense, conditional config)

## Environment API

- `guide/api-environment.md` — Environment API overview
- `guide/api-environment-instances.md` — Using `Environment` Instances
- `guide/api-environment-plugins.md` — Environment API for Plugins
- `guide/api-environment-frameworks.md` — Environment API for Frameworks
- `guide/api-environment-runtimes.md` — Environment API for Runtimes

## Config reference

- `config/shared-options.md` — Shared Options
- `config/server-options.md` — Server Options
- `config/build-options.md` — Build Options
- `config/preview-options.md` — Preview Options
- `config/dep-optimization-options.md` — Dep Optimization Options
- `config/ssr-options.md` — SSR Options
- `config/worker-options.md` — Worker Options

## Future (deprecation migration pages)

- `changes/this-environment-in-hooks.md` — `this.environment` in Hooks
- `changes/hotupdate-hook.md` — HMR `hotUpdate` Plugin Hook
- `changes/per-environment-apis.md` — Move to Per-environment APIs
- `changes/ssr-using-modulerunner.md` — SSR Using `ModuleRunner` API
- `changes/shared-plugins-during-build.md` — Shared Plugins during Build

## Other

- `live.md` — 5th-anniversary event announcement (vendored for llms.txt completeness; no technical content)
- `acknowledgements.md` — Acknowledgements
- `plugins.md` — Official plugins list
- `releases.md` — Release cycle and supported-version policy
