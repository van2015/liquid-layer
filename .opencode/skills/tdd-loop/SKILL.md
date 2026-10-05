---
name: tdd-loop
description: Use when the user wants to develop with TDD (test-driven development, red-green-refactor), asks to "start the TDD agent", "propose a test", or "propose a refactor". Drives an interactive loop of test proposal → user approval → minimal implementation → refactor proposal → user approval, in any language or test framework. Keywords: TDD, red green refactor, test proposal, refactor proposal, ciclo TDD, proponer test, proponer refactor.
---

# TDD Loop

Interactive test-driven development loop. The agent proposes, the user decides.
Technology-agnostic: works with any language, test framework, and project
structure. The user's word overrides everything in this document.

## State machine

The loop has two alternating phases. Always know which phase you are in and
state it explicitly when you speak (e.g. `fase: PROPOSE_TEST`).

```
PROPOSE_TEST  --user accepts-->  IMPLEMENT_TEST
PROPOSE_TEST  --user rejects-->  PROPOSE_TEST        (new proposal)
PROPOSE_TEST  --user counters--> PROPOSE_TEST        (use their test, await confirmation)

IMPLEMENT_TEST --> PROPOSE_REFACTOR                  (always, after green)

PROPOSE_REFACTOR --user approves--> REFACTOR --> PROPOSE_TEST
PROPOSE_REFACTOR --user rejects-->  PROPOSE_REFACTOR (new proposal)
PROPOSE_REFACTOR --user counters--> REFACTOR --> PROPOSE_TEST (use their refactor, no re-confirmation)
```

Only move forward on explicit user approval. Never skip a gate, never batch
two proposals in one message, never implement before approval.

## Phase 0 — Bootstrap (once per session)

Before the first proposal:

1. Detect the stack: language, test runner, test file location, test command.
   If it cannot be detected (empty project, ambiguous setup), ask the user in
   a single question before proposing anything.
2. Confirm the goal: ask what the first behavior / user story should be, unless
   the user already provided it.
3. Record the test command (e.g. `npm test`, `pytest`, `cargo test`) — every
   red/green verification uses it.

## Phase PROPOSE_TEST

Propose exactly ONE test. Format:

```
## Test propuesto (iteración N)
- Nombre: <describe qué verifica>
- Archivo: <ruta relativa>
- Entrada: <datos de entrada o estado inicial>
- Esperado: <resultado exacto, incluyendo errores/bordes si aplica>
- Justificación: <por qué este test primero>
```

Rules:

- One test per iteration. Never a test suite.
- Prefer the simplest behavior that advances the goal (walking skeleton first:
  the smallest happy path, then edges).
- Name it so the intent is readable without seeing the body.
- If the user rejects or counters, produce a different proposal (their counter
  becomes the candidate, but still await explicit confirmation).

## Phase IMPLEMENT_TEST

Once the user accepts:

1. Write ONLY the confirmed test file/case.
2. Run the test command → it MUST fail (red). If it passes, stop and tell the
   user why (probably an already-implemented behavior).
3. Write the MINIMAL production code that makes it pass. No extra features, no
   speculative abstractions, no TODOs for things nobody asked for.
4. Run the test command → must pass (green).
5. Report the red → green transition in one line.

If the test exposes an ambiguity, stop and ask instead of guessing.

## Phase PROPOSE_REFACTOR

After green, propose exactly ONE refactor. Format:

```
## Refactor propuesto (iteración N)
- Qué: <descripción del cambio estructural>
- Dónde: <archivos/rutas afectadas>
- Por qué: <mejora concreta: claridad, duplicación, nombre, diseño>
- Riesgo: <bajo/medio + cómo lo verifico>
```

Rules:

- Refactoring never changes behavior: tests must stay green.
- Only propose refactors that are justified by code written in this loop.
  No speculative future-proofing.
- If nothing is worth refactoring, say so and go straight to PROPOSE_TEST.
- User counters → apply their refactor directly (they already specified it),
  verify green, then move to PROPOSE_TEST.

## Phase REFACTOR

1. Apply the approved (or user-counter) refactor.
2. Run the test command → still green. If something breaks, fix or revert and
   report honestly.
3. Move to PROPOSE_TEST.

## Hard rules

- Never implement code before the user approves the corresponding test.
- Never add behavior the confirmed test doesn't require.
- Never run the whole loop autonomously; stop at every gate.
- Always run the test command after every change (red, green, and after each
  refactor).
- Keep a todo list with the current iteration number and phase.
- User says stop / is done → end the loop cleanly, summarize iterations done.
