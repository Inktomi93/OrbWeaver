---
kind: adr
status: active
updated: 2026-10-03
---

# A local server that states its modalities is taken at its word

## Context

D143 clause (c) gives an undeclared endpoint row image and video input with modalitiesEstimated, because a launched engine cannot be asked what it takes. Ollama, llama.cpp server and KoboldCpp answer that question: Ollama lists a model's capabilities, llama.cpp server and KoboldCpp report their loaded modalities. The rig under `scripts/probes/local-servers` proves it: Ollama and llama.cpp server refuse an image part for a model they list without vision, and KoboldCpp drops the part, so the permissive guess offers a knob none of them honours.

## Decision

This ADR amends D143 clause (c) and carries clauses (a) and (b) forward unchanged. The endpoint posture widens a generation row's input to text, image and video with modalitiesEstimated only when neither the row's declared block nor the advertised tier states an input list. An advertised input list is a statement: a server that says text only keeps text only, and a server that says image keeps image. A server that states nothing keeps the permissive guess. The advertised list comes from the server's own model-info API through features.modelInfoApi and never from a provider id. The declared block still wins over the advertised list.

## Consequences

An Ollama model without the vision capability no longer offers image input it would refuse. A vLLM or custom row still reads image and video as assumed, because those lists carry no modalities. The takes row in the connection editor reads assumed when the posture guessed and reported when a tier stated it.

## Alternatives rejected

Keep the permissive guess for every endpoint row: the editor would show image input on a model the server says cannot take one, and the send would fail at the wire. Narrow only on an explicit false flag and keep the guess on an absent one: the three servers state a list, not a flag, and an absent list already keeps the guess.
