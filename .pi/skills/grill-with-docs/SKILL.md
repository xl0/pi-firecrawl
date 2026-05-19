---
name: grill-with-docs
description: Grilling session that challenges your plan against existing project docs and records durable decisions as ADRs. Use when user wants to stress-test a plan against the project and leave concise decision records behind.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

As decisions crystallise, update `PLAN.md` inline. Update `CODE.md` only when the actual codebase state changes. Keep docs concise and current-state oriented, not changelogs. Compact `PLAN.md` as work lands: mark completed items, remove obsolete detail, and keep only the next useful plan.

</what-to-do>

<supporting-info>

## Documentation awareness

During codebase exploration, look for existing planning and decision documentation:

```text
/
├── PLAN.md
├── CODE.md
└── docs/
    └── adr/
        ├── 0001-some-decision.md
        └── 0002-another-decision.md
```

Create documentation lazily — only when there is something durable to record. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'job' — do you mean the conversion run or the page worker? Those are different things."

### Discuss concrete scenarios

When relationships or boundaries are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force precision.

### Cross-reference with code/docs

When the user states how something works, check whether the code and docs agree. If you find a contradiction, surface it.

### Update planning docs inline

When a decision affects the project plan, update `PLAN.md` right there. When implementation changes affect the actual codebase state, update `CODE.md`. Don't batch these up unnecessarily. Do not let `PLAN.md` become a history log; compact completed sections into the current forward-looking plan.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

</supporting-info>
