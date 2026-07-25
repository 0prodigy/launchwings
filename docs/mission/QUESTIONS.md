# QUESTIONS — blocking decisions queued for the founder

> Append-only. The autonomous loop writes here whenever it hits a question
> only the founder can answer. The loop does NOT silent-stop and does NOT
> silent-assume — it logs the question, picks the next unblocked tick, and
> continues. Founder reviews this file on return and resolves in batch.
>
> Format: `## Q-N — <one-line summary>` then **Context**, **What blocks**,
> **Default assumption (used while pending)**, **Resolved:** (filled by founder).

(none yet — ADR-0007 author will populate the first batch)
