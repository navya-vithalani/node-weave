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

---

### 2026-07-24 — Robust AI JSON extraction

**What:** Added multi-stage JSON extraction in both `/api` endpoints. If the AI response isn't valid JSON on first parse, the code now strips markdown fences and any text before the first `{` / after the last `}` before retrying, rather than immediately failing.

**Why:** The `gemini-3.6-flash` model sometimes wraps JSON in markdown fences or includes brief commentary before/after the JSON block, which caused a 500 error when it happened. The extraction pipeline makes the endpoint resilient to these common AI output patterns.

**Affects:** `api/structure.ts`, `api/chat.ts`

---

### 2026-07-24 — Switched to Gemini-native `systemInstruction` field

**What:** Moved system prompts from being sent as a `user` part in the `contents` array to using Gemini's dedicated `systemInstruction` block. The request body now has `systemInstruction: { parts: [{ text: prompt }] }` alongside `contents`.

**Why:** Google's API docs recommend this for proper system prompt handling. The previous approach bundled the system prompt as an additional user message part, which could confuse the model about which text is the instruction vs the actual user query.

**Affects:** `api/structure.ts`, `api/chat.ts`

---

### 2026-08-28 — Added "Topic Only" guide item with AI prompt

**What:** Added a new guide item in the Upload tab that lets users generate structured markdown files using an external AI. The item includes a subtle "Copy prompt" link (italic, accent color, hover effects) that copies a prompt to the clipboard.

**Why:** Users may want to create knowledge graphs about topics they don't have local sources for. This provides a workflow: copy prompt → send to any AI → save output as .md/.txt → upload to NodeWeave.

**Affects:** `Uploader.tsx` (guide section), `uploader-ext.css` (copy prompt styling)

---

### 2026-08-28 — Multiple session merge in Restore tab

**What:** Changed Restore tab to accept multiple JSON session files instead of just one. Files accumulate in a list (like the Upload tab's file list). When continuing:
- **One session:** goes directly to dashboard
- **Multiple sessions:** sent separately to AI for merging

Session name defaults to "FirstSessionName - 2" and is editable. Users can remove individual sessions from the list.

**Why:** Users may want to combine multiple knowledge graphs into one. Sending sessions separately to AI preserves context while allowing the AI to handle deduplication and connection generation.

**Affects:** `Uploader.tsx` (import handlers, file list, continue logic), `App.tsx` (UploaderData interface)

**Propmt for the AI:** 
```
You are merging multiple already-structured knowledge graph sessions — each one previously processed by this same system — into one consolidated knowledge graph. Each input session may include AI-generated topics/subtopics/points, human-added custom insights (customInsights arrays), and a modified flag marking content a human has manually corrected.

Follow these rules exactly:

1. Where multiple sessions cover the same or overlapping topic, merge them into a single topic/subtopic, combining unique points and removing exact or near-duplicate ones.
2. Never discard, reword, or merge away a customInsights entry. Every custom insight from every input session must appear unchanged in the output, still anchored to its topic/subtopic (update anchorTopicId if that topic's id changes during merge, but the insight text itself must be preserved exactly).
3. Any topic/subtopic/point marked modified: true represents a human correction and is more authoritative than un-marked AI-generated content covering the same claim. If a modified entry conflicts with content from another session, keep the modified version and note the discrepancy in the summary rather than silently overwriting it.
4. Identify and add new connections between topics originating from different sessions where they're conceptually related, in addition to preserving connections that already existed within each input session.
5. Preserve the modified flag on any content that already had it set to true.
6. If merging two topics/subtopics whose ids differ, choose one canonical id.

Output ONLY valid JSON matching the given schema. No prose, no markdown fences, no commentary outside the JSON.
```

---

### 2026-08-28 — Session name handling in Uploader

**What:** Added editable session name input to both tabs with default behaviors:
- **Upload:** defaults to "Untitled Session" if empty
- **Restore:** defaults to "FirstSessionName - 2" on first import

**Why:** Users should be able to name their sessions. For Restore, a default that appends " - 2" provides a clear indication that this is a new, merged session.

**Affects:** `Uploader.tsx` (session input in Restore tab), `App.tsx` (UploaderData handling)