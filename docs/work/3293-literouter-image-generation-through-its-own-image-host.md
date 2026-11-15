---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# LiteRouter image generation through its own image host

## What

LiteRouter serves an OpenAI-format `POST /v1/images/generations` on `image.literouter.com` (model, prompt, size, one image back as `b64_json`), which our `images-api` branch already speaks; image models are marked `type: image` on the chat host's list. The fork: (a) a second built-in row with the image host as its base URL, which needs its own saved key (keys are sealed per provider id) and a catalog read from the chat host's list filtered to `type: image`; or (b) one row with a per-task image base URL field, which needs a seam in the images branch and an egress pin admitting two hosts for one row.

## Why

LiteRouter users have image models on their plan that the app cannot use.

## Done when

The owner picks (a) or (b), and a LiteRouter key generates one image through the add dialog's flow, with the image models listed for the image picker only.

## Evidence

Filled at landing: what ran and where its output is.
