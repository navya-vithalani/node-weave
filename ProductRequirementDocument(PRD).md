# NodeWeave — Product Requirements Document (PRD)

**Status:** v1 draft, reflecting full scope decided in planning discussion
**Working name:** NodeWeave

---

## 1. Vision & Positioning

NodeWeave sits between two existing tools without being either of them:

- **NotebookLM** auto-generates a topic map from your documents, but the map is read-only and disposable — you can't reshape it, annotate it, or make it reflect your own evolving understanding.
- **Obsidian's Canvas** gives you total manual control over a knowledge graph, but nothing gets you started — every node and edge is hand-built.

NodeWeave's core bet: **let AI draft the first structure from your raw material, then hand you full editorial control to reshape it into something that's actually yours.**

**One-line pitch:** *AI drafts the map. You own and reshape it.*

---

## 2. Problem Statement

Students and self-directed learners tackling a broad or unfamiliar subject (a physics chapter, an economics unit, "how stock markets actually work") face two bad defaults: read passively and hope structure emerges on its own, or spend hours manually outlining before they've even understood the material. AI tools like NotebookLM solve the first half — fast structure from raw text — but that structure doesn't become a durable, personal artifact the learner keeps correcting and building on across a subject. It's a snapshot, not a workspace.

---

## 3. Target user & primary use case

A self-directed learner — the founding use case is competitive-exam prep, deep multi-source study of technical subjects — who:

- Has multiple sources on the same subject (textbook chapter, class notes, web references, or even a topic prompt fed to an LLM) that don't perfectly overlap or agree
- Wants a structured overview fast, but also wants to correct, extend, and annotate that structure as understanding deepens
- Values owning their data locally over the convenience of a hosted account
- Will be drawn to a distinctive, technical-feeling aesthetic — but the interface itself is designed to be broadly approachable and engaging for anyone, not gatekept to technical users.

**Explicit subject range:** anything from a single technical chapter (electrostatics) to a broad multi-source topic (quantum mechanics, stock market mechanics, linguistics, macroeconomics). The RAG architecture (see TRD §5) exists specifically to make the wide end of this range viable without hitting context-window limits.

---

## 4. Goals

- **G1:** Turn 1–N raw source documents (.txt, .md, .pdf) into one consolidated, hierarchical knowledge structure (topics → subtopics → points) with cross-topic connections — even when sources overlap, disagree, or vary wildly in structure and completeness.
- **G2:** Let the user ask grounded questions via chat, with every answer traceable to specific source material, and an honest refusal when something isn't covered.
- **G3:** Let the user reshape the AI's draft through three equally valid entry points: direct canvas manipulation, chat instruction, or an AI-initiated correction — without ever touching the original AI-generated structure underneath.
- **G4:** Work entirely without a backend database — all durable state lives in the user's browser and in exportable JSON files they fully control.
- **G5:** Degrade gracefully, not silently, when free-tier AI quota runs out mid-session — switch to a rule-based lookup mode rather than failing.

---

## 5. Non-goals (v1)

- **Not** building real-time multi-user collaboration.
- **Not** building accounts, auth, or hosted multi-device sync — single-device, browser-local by design.
- **Not** monetizing. Planned as an open-source project (see §9).
- **Not** supporting adding new documents to an already-structured session mid-way through (see §8 — deferred to v2, deliberately).
- **Not** eliminating hallucination entirely. Mitigated via prompting, grounding, and citations (see TRD §6) — not solved.
- **Not** committing to mobile support in v1 — see §10 for the intended future direction, kept deliberately out of scope for now.

---

## 6. Core user flows

(High-level only — full UI spec lives in `design.md`.)

1. **First visit** → boot-up tutorial (3-step terminal modal) → skip or complete.
2. **Upload** → name the session → drop one or more files (.txt/.md/.pdf) or import a previously exported session JSON → continue.
3. **Structuring** → terminal loading screen shows real pipeline status → one consolidated knowledge graph is produced, reconciling all uploaded sources into a single structure.
4. **Explore & study** → split-screen dashboard: graph canvas (left) + chat sidebar (right). Click to expand nodes, ask grounded questions, get cited answers.
5. **Reshape** → via drag/edit mode, chat instruction, or an AI-flagged correction — all three write to one editable working copy, leaving the original AI-generated structure untouched.
6. **Capture insight** → AI-surfaced breakthrough moments in chat can be frozen into the graph as a distinct insight node, linked to the topic that produced it.
7. **Export** → original structure / edited structure / both, as JSON, at any time. Exports also bundle the chunk + embedding store so a reimported session keeps chat/RAG fully functional, not just the graph — see TRD §3.5.

---

## 7. Feature scope

### MVP (build and validate first)
- Multi-file upload (.txt/.md/.pdf) with client-side PDF text extraction
- Multi-document consolidation structuring (single AI-authored nested JSON, merging overlapping sources, flagging conflicts)
- Graph rendering with lazy, click-to-expand layout
- RAG-grounded chat with source citations
- Hallucination mitigation (strict grounding prompt, low temperature, citation requirement)
- Session AI-budget cap with rule-based (non-AI) fallback lookup mode
- JSON export (original / edited / both) and JSON re-import with schema validation before load (see TRD §13)

### Full v1 scope (build after MVP validates the core loop)
- Manual edit mode (drag nodes, draw custom connections)
- Chat-instructed map edits
- AI-detected correction flow (mismatch banner + fix)
- Insight injection ("Add insight to canvas")
- ASCII diagram generation in chat
- Hide/show subtopics toggle with layout regeneration
- Light/dark mode
- Terminal boot tutorial + retro UI system

### Explicitly out of scope for v1 (deferred / v2 candidates)
- Adding documents to an already-structured session (requires merge-without-duplication against existing structure and chat history — real scope, deferred deliberately; see TRD §5.4)
- Any authentication/accounts, even though the architecture doesn't preclude adding it later
- Any paid tier or usage metering beyond the local session cap
- Image/handwritten-notes input via AI vision (see TRD §4.3) — genuinely useful, but real scope beyond the MVP text/PDF flow; noted as a near-term extension, not v1
- Mobile-optimized layout beyond basic responsive CSS — full parity, especially for edit mode, is deferred; see §1

---

## 8. Known risks / open questions

Carried into `plan.md` as explicit build checkpoints, not left as vague concerns:

- **Consolidation prompt reliability** across messy, varied source material — the single biggest unknown, tested first in the build plan (Step 1).
- **elkjs + React Flow performance** at real scale (100+ node documents) — tested explicitly before deep investment in edit-mode polish (Step 8).
- **Free-tier AI API rate limits** (requests/day, not just per-minute) under real daily use by multiple users.
- Whether the correction-flow "diff vs. auto-apply" line (TRD §7) feels right in practice — flagged for your judgment during the build, not fully resolvable on paper.

---

## 9. Licensing & distribution

Open source. No paywall, no gated features, no plan to add one — the local-only, no-account architecture is a deliberate fit with this decision, not a limitation to work around later. If NodeWeave ever needs a sustainability mechanism, sponsorship/donations fit this architecture; a paywall does not.

## 10. Future considerations (not v1 commitments)
 
Noted here so they aren't lost, but explicitly not part of the v1 build:
 
- **Mobile view-only mode:** browsing the graph and chatting works on a phone; editing (drag/connect) stays desktop-only, since touch-friendly graph editing is real UX work, not a CSS breakpoint. See design.md §5 and TRD §1 for the groundwork (flexible CSS from the start) that keeps this cheap to add later.
- **Image/handwritten-notes input:** Gemini's native vision support means `/api/structure` could accept a photo of handwritten notes directly and transcribe + structure it in one call, no separate OCR pipeline needed. See TRD §4.3.
- **Resumable session budget:** storing the running AI-call count inside the exported JSON so reopening a session continues the same budget instead of resetting it — an alternative to the current per-sitting soft cap, if that starts to feel wrong in practice.
- **Mid-session document addition:** merging a newly added document into an already-structured session without duplication — see TRD §5.4 for the sketch of how this would work.