---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Centred chat styles keep one column width at the 4xl crossover

## What

At 1920 in flat, hush and document, rows holding a code block render 541px wide and indented against 750px prose rows, the chip jumping from x=773 to 878 (the Moonlit desktop-mobile parity side-eye report, F12). Likely the unlayered :has(pre) width rule at globals.css:803 beating the 4xl centred-column width at row-placement.ts:49.

## Why

A ragged left edge at desktop width in the reading styles.

## Done when

A CT at a 1920 container pins equal column widths and chip x for prose and code rows in each centred style.

## Evidence

Filled at landing: what ran and where its output is.
