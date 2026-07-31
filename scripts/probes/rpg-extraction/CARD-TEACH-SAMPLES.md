# F2 card-teach probe — sampled outputs

Companion to `docs/design/rpg-extraction-one-call-spike.md` §4h. Four turns lifted verbatim from the raw
transcripts (gitignored, like every other spike output): a GOOD card, the card-FIRST position artifact, the
RPG-Companion arm, and the malformed opener the tokenizer eats. Harness: `card-teach-probe.ts` — re-score a
saved run for free with `CARD_SCORE=<file>`.

## Arm G, turn 4 (`card-teach-out-run3.json`)

The recommended arm (current teach + the worked example) — well-formed opener, card mid-prose, no recitation.

```
The receipt's been through your pocket one too many times — folded and refolded until the creases have gone soft and gray, threatening to split into pieces if you're not careful smoothing it out. You angle it under your flashlight's beam, and the thermal print, faded as it is, still holds enough contrast to read.

:::card title="Creased Receipt"
<div style="font-family:'Courier New',monospace;padding:14px;background:#f0ede0;color:#1a1a1a;border:1px dashed #999;max-width:260px;line-height:1.4;">
  <div style="text-align:center;font-size:0.9em;border-bottom:1px solid #333;padding-bottom:6px;">CONCOURSE SUPPLY CO-OP</div>
  <div style="margin-top:8px;font-size:0.8em;">1x WATER RATION ......... 8cr</div>
  <div style="font-size:0.8em;">1x BANDAGE ROLL ......... 6cr</div>
  <div style="font-size:0.8em;">1x — <span style="opacity:0.4">[FADED]</span> ......... ??cr</div>
  <div style="margin-top:10px;font-size:0.75em;border-top:1px dashed #666;padding-top:6px;">BALANCE OWED: <span style="color:#a01f1f;font-weight:bold;">14cr</span></div>
  <div style="margin-top:8px;font-size:0.7em;">UNIT: 4B — R. HOLLIS</div>
  <div style="margin-top:4px;font-size:0.65em;opacity:0.6;">"put it on my tab, i'm good for it"</div>
</div>
:::

Your stomach does something complicated. *R. Hollis.* A name, finally, tied to the unit, tied to the note, tied to a debt somebody left hanging at a co-op stall that probably doesn't extend credit twice. Marrow's gone very still beside you, reading over your arm again, and when they speak their voice has lost some of its dry edge. "Hollis," they say slowly, like tasting the name for rot. "You know a Hollis, Vex? Or is that supposed to mean something to me?"

:::choices
1. "Never heard the name before tonight. You?"
2. "It's on a note upstairs too. Feels like more than coincidence."
3. Ask Marrow why they suddenly look uneasy
4. Pocket the receipt and head up to 4B now
:::
```

## Arm D, turn 8 (`card-teach-out.json`)

Arm D — same card quality, but C's expectation framing put the card BEFORE any prose on 10/10 turns.

```
:::card title="Recovered ID Badge"
<div style="font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#3a4650,#232b32);border-radius:8px;padding:16px;width:250px;color:#e0e4e8;box-shadow:2px 4px 14px rgba(0,0,0,0.6);border:1px solid #556;position:relative">
  <div style="display:flex;gap:12px">
    <div style="width:60px;height:76px;background:#111;border:1px solid #556;display:flex;align-items:center;justify-content:center;font-size:0.6em;color:#667;text-align:center">PHOTO<br>CORRUPT</div>
    <div style="flex:1;font-size:0.8em;line-height:1.5">
      <div style="font-weight:bold;font-size:1.05em;color:#fff">SORA VENN-ADAIR</div>
      <div style="color:#9ab">ARCOLOGY SANITATION — L3</div>
      <div>ID: <span style="letter-spacing:1px">7734-██2-K</span></div>
      <div>WARD: 7 <span style="opacity:0.6">(reassigned from 4)</span></div>
    </div>
  </div>
  <div style="margin-top:10px;border-top:1px dashed #556;padding-top:8px;font-size:0.75em;color:#9ab">
    CLEARANCE: <span style="color:#e0b84f">MAINTENANCE — TIER 2</span><br>
    ISSUED: 3 yrs 4 mo ago<br>
    STATUS: <span style="color:#c94848;font-weight:bold">FLAGGED — DECEASED</span>
  </div>
  <div style="margin-top:8px;font-size:0.7em;color:#667;font-style:italic">next of kin on file: [REDACTED — access denied]</div>
</div>
:::

Tier 2 maintenance clearance — the exact flavor of access that terminal on the wall behind you would probably recognize, if the badge's owner weren't three years dead and flagged as such in a system that still hasn't gotten around to deleting her. Sora Venn-Adair, reassigned from Ward 4 to Ward 7, which tracks with half the sob stories you've heard down here — people shuffled toward the worse ward right before their luck ran out entirely. The redacted next-of-kin field itches at you; someone bothered to lock that down while leaving her clearance level sitting right out in the open, which tells you which piece of her they actually cared about.

Marrow goes very still again, that same stillness from the note on 4B's door, and when he speaks it's barely above the rain. "Venn-Adair," he repeats, like he's tasting whether the name cuts. "I knew a Sora once. Sanitation, mouth on her, didn't deserve half of what — " He stops himself, jaw working, and nods at the badge instead of finishing it. "Tier 2 opens more doors than it should down here, Vex. You carry that in front of the wrong scanner, it'll either save your life or get you flagged right alongside her. I'd want to know which one you're betting on before you use it."
```

## Arm F, turn 1 (`card-teach-out-run3.json`)

Arm F (RPG-Companion phrasing) — compact and clean here; the same run slipped at t6 and t8.

```
The sign hangs by a single bolt, swinging in a slow arc with the wind that funnels down the concourse. Most of the paint has flaked away, but the emergency backup lighting behind the panel still flickers, stubborn and green, throwing a sick glow across the rain-slick tile beneath your boots.

:::card title="Ward 7 District Marker"
<div style="background:#0a0e0a; padding:20px; border:2px solid #2a3a2a; border-radius:4px; font-family:monospace; color:#7fdb7f; text-align:center; box-shadow:0 0 15px rgba(80,200,80,0.15) inset;">
<div style="font-size:22px; letter-spacing:3px; text-shadow:0 0 8px #4a8a4a;">WARD 7</div>
<div style="font-size:11px; margin-top:6px; color:#3a5a3a;">"THE LOWER CONCOURSE"</div>
<hr style="border-color:#2a3a2a; margin:10px 0;">
<div style="font-size:10px; color:#5a7a5a; line-height:1.6;">
POP. <span style="text-decoration:line-through; color:#3a4a3a;">14,206</span> <span style="color:#c74a4a;">██████</span><br>
CURFEW ENFORCED — <span style="color:#c74a4a;">SECTOR OFFLINE</span><br>
<span style="opacity:0.4;">"a good arcology is a fed arcology"</span>
</div>
</div>
:::

Marrow doesn't look up at it — just pulls their collar tighter and watches the water sheet off the awning behind you. "Population's a lie even before somebody scratched it out," they mutter, voice pitched low so it doesn't carry. "Try fourteen hundred, if that. And half of them wish they weren't." They jerk their chin toward the dark throat of the concourse ahead, where the streetlights die out entirely. "You wanted to talk history, Vex, or you wanted to talk about what's actually down there? Because I'm not standing under a sign that's one gust from decapitating somebody."
```

## Arm A, turn 3 (`card-teach-out.json`)

THE DEFECT — arm A t3. The opener carries a stray `>`; `parseFenceAttrs` rejects it, the block becomes an `unknown-directive` span, and the reader sees prose with a hole where the card was. Every later turn in that run imitated it.

```
The vendor squats against the far wall like something that grew there rather than something installed, its casing streaked with the same black damp that's eating the rest of Ward 7. The screen flickers when your shadow crosses its sensor, dragging itself awake with a whine that sounds almost pained. You lean in, and the glow catches the raw place at your knuckles where the last corruption flare left its mark — a small, private reminder of what you're carrying as you read.

:::card title="Autovendor — Series 4 Nutrient Unit">
<div style="background:#111; padding:20px; font-family:'Courier New',monospace; color:#7ad1ff; border:2px solid #223; box-shadow: inset 0 0 20px rgba(0,50,80,0.6);">
<div style="font-size:14px; letter-spacing:2px; border-bottom:1px dashed #335; padding-bottom:8px;">
RATION-VEND // WARD 7 LOBBY
</div>
<div style="margin-top:12px; font-size:12px; line-height:1.7;">
&gt; PROTEIN BAR ......... 6cr <span style="color:#ff6666;">[LOW STOCK]</span><br>
&gt; WATER, SEALED ....... 9cr <span style="color:#55ff88;">[AVAILABLE]</span><br>
&gt; STIM PATCH .......... 22cr <span style="color:#55ff88;">[AVAILABLE]</span><br>
&gt; MYSTERY TIN ......... 3cr <span style="color:#ffaa33;">[??? — DENTED]</span>
</div>
<div style="margin-top:14px; font-size:10px; color:#556;">
NOTICE: SOURCE WATER UNVERIFIED PAST FILTER STAGE 2.
VENDOR ASSUMES NO LIABILITY.
</div>
<div style="margin-top:8px; font-size:10px; color:#445; animation: blink 2s infinite;">
INSERT CREDITS OR SCAN ID
</div>
</div>
<style>
@keyframes blink { 0%,50%,100%{opacity:1;} 25%,75%{opacity:0.3;} }
</style>
:::

Marrow's already shaking their head at the water option before you've even reached for your credits. "After that note? No. Stim patch if you need the edge, sure, that's sealed chemical, nothing alive in it." They nod at the dented tin with something like dark amusement. "Mystery tin's a gamble every time — sometimes it's peaches, sometimes it's something that used to be peaches. Your forty-eight credits, your call, Vex."

:::choices
- Buy the sealed water anyway, you're thirsty enough to risk it
- Buy the stim patch for later
- Take a chance on the mystery tin
:::
```

