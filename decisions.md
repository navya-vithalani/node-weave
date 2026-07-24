# NodeWeave — Design Decisions Log

This file tracks intentional deviations from the original PRD, TRD, and Design.md that occur during the build. Each entry includes what was decided, why, and when.

---

### 2026-07-24 — Added `discrepancy` field to subtopic schema

**What:** Added a nullable `discrepancy` field to the Subtopic type in both `src/types/schema.ts` and the `/api/structure` endpoint's `TARGET_SCHEMA` and system prompts. The AI is prompted to populate this field when source documents disagree on a point, rather than only noting the conflict in prose inside the summary.

**Why:** Having a structured `discrepancy` field makes it straightforward to surface conflicts in the UI (e.g., a conflict badge or tooltip on the affected node), rather than having to parse natural-language summaries to find disagreements. This was flagged during Step 1 testing when the AI's first output buried conflict notes inside summaries.

**Affects:** TRD §3.1 (data model), TRD §4.1 (API contract), system prompts in `api/structure.ts`

---

### 2026-07-24 — Model downgrade to gemini-1.5-flash (then upgrade to gemini-3.6-flash)

**What:** Started with `gemini-2.5-flash` per TRD §4, but it was unavailable to new users. Switched to `gemini-2.0-flash`, which had zero free-tier quota. Settled on `gemini-1.5-flash`, which worked. Later the user found `gemini-3.6-flash` worked directly.

**Why:** Free-tier API availability. The model name in the code should be treated as a configuration value, not a design constant — it will change as Google's model availability evolves.

**Affects:** TRD §4 (AI provider), `api/structure.ts`, `api/chat.ts`

---

### 2026-07-24 — Server-side `createdAt` override

**What:** The `/api/structure` endpoint now overwrites the AI's `createdAt` value with the real server timestamp after receiving the response.

**Why:** The AI fabricates a timestamp (first run returned "2023-10-24") which is meaningless. The real creation time should reflect when the structure was actually generated.

**Affects:** TRD §3.1, `api/structure.ts`