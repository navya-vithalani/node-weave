# NodeWeave — Build Plan

**How to use this file:** each step below is one unit of work for the coding agent. After completing a step, the agent must **stop**, summarize what it built, and present the "Verify before continuing" checklist. Do not proceed to the next step until explicitly told to continue. If a step's verification fails, fix the issue within that step before moving on — don't carry known-broken work forward. Let me complete the verifiction pipeline and confirm everything works before moving on

Process note: starting from Step 0, this project is deployed to a live Vercel URL, not just run locally. From Step 1 onward, "verify before continuing" means checking against the deployed URL, not only localhost, unless a step explicitly says local-only is fine.

---

## Step 0 — Repo scaffolding

**Goal:** monorepo skeleton, no logic yet.

**Tasks:**
1. Initialize the folder structure from TRD §1.
2. Set up `package.json`, TypeScript config, Vite config for `/src`.
3. Create `.env.example` (TRD §12) and a gitignored `.env.local` for local dev keys.
4. Confirm `vercel dev` runs and serves a placeholder page.

🛑 **Verify before continuing:**
- [ ] deploy to vercel & check `vercel dev` starts without errors.
- [ ] Folder structure matches TRD §1.
- [ ] `.env.local` is gitignored.

---

## Step 1 — `/api/structure` endpoint

**Goal:** the highest-risk piece in the whole project, built and tested first, before anything is built on top of it.

**Tasks:**
1. Implement per TRD §4.1 — exact system prompt, exact request/response shape.
2. Add the multi-call splitting rule (TRD §4.1) as a stub even if not exercised yet.
3. Test with 2–3 real sample documents on the same topic that partially overlap and partially conflict — use real study material here, not synthetic placeholder text.

🛑 **Verify before continuing:**
- [ ] Inspect the returned JSON by eye. Does it actually merge overlapping subtopics, or just concatenate both sources' topics side by side?
- [ ] Introduce a real point of disagreement between two sample docs — check the summary acknowledges it rather than silently picking one.
- [ ] If merge quality is poor, iterate on the system prompt now, before building anything downstream of it.

---

## Step 2 — Client-side chunking + embeddings

**Tasks:**
1. Implement `lib/chunking.ts` per TRD §5.1.
2. Implement `lib/embeddings.ts` using transformers.js and the chosen model (TRD §5.2).
3. Implement `lib/retrieval.ts` (cosine similarity, top-K=5).

🛑 **Verify before continuing:**
- [ ] Run a handful of test queries against a known document and manually check the top-5 retrieved chunks are actually relevant, not just topically adjacent.
- [ ] Confirm embedding generation runs entirely in-browser — check the network tab for zero calls to any embedding API.

---

## Step 3 — `/api/chat` endpoint

**Tasks:**
1. Implement per TRD §4.2 — one structured response per turn covering answer, citations, insight flag, ASCII flag, correction flag.
2. Wire in the retrieved chunks + relevant JSON slice from Step 2.

🛑 **Verify before continuing:**
- [ ] Ask something genuinely not covered by the uploaded material — confirm the exact refusal string comes back, not an invented answer.
- [ ] Ask something that is covered — confirm `sourceIds` points to a real, correct node.
- [ ] Confirm exactly one API call fires per chat turn (check the network tab) — this is where a silent double-call bug would hide.

---

## Step 4 — Frontend shell + Phase 1 boot tutorial

**Tasks:** build per `design.md` §2 (Phase 1).

🛑 **Verify before continuing:**
- [ ] Visual check against `design.md`'s copy and layout.
- [ ] Skip and complete-all-steps both correctly transition to Phase 2.

---

## Step 5 — Phase 2 uploader

**Tasks:** multi-file upload including direct PDF (pdf.js), session naming, JSON import path, per `design.md` §2,  with validateSessionJson() (TRD §13) run before the continue button activates.

🛑 **Verify before continuing:**
- [ ] Upload a real PDF — confirm extracted text looks correct, not garbled.
- [ ] Confirm the file picker actually restricts to `.txt/.md/.pdf` at the OS level.
- [ ] Import a previously exported session JSON — confirm it's recognized as an alternate path straight to Phase 4.
- Import a deliberately malformed/unrelated JSON file — confirm it's rejected with a specific, readable error, not a crash or silent failure.

---

## Step 6 — Phase 3 loading screen wired to the real pipeline

**Tasks:** connect the uploader to Steps 1&2's real endpoints/functions, streaming status updates per `design.md` §2.

🛑 **Verify before continuing:**
- [ ] Upload a large real document set — confirm it completes within Vercel's function duration and doesn't silently time out.
- [ ] Confirm status lines reflect real pipeline progress, not a fixed animation timer.

---

## Step 7 — Phase 4 dashboard shell

**Tasks:** navbar, 66/33 split, light/dark toggle, per `design.md` §2.

🛑 **Verify before continuing:** 
- visual check; toggle both modes against the palette in `design.md` §1.

---

## Step 8 — Graph rendering (lazy)

**Tasks:** React Flow + elkjs per TRD §9, click-to-expand, clustering above 8 subtopics.

🛑 **Verify before continuing:**
- [ ] Load a genuinely large structured JSON (50+ nodes) — check responsiveness while expanding branches.
- [ ] Confirm clustering kicks in above the threshold and expands correctly on click.

---

## Step 9 — Chat sidebar wired live + budget cap

**Tasks:** connect Step 3's endpoint, citation chips, budget counter + rule-based fallback (TRD §10).

🛑 **Verify before continuing:**
- [ ] Deliberately exhaust the session cap (lower it temporarily for testing) — confirm the switch to `[LOOKUP]` mode is visible and accurate.
- [ ] Ask the rule-based mode something genuinely absent from the map — confirm the exact fallback message, not a crash or empty response.

---

## Step 10 — Unified edit pipeline

**Tasks:** copy-on-write working JSON, `applyEdit()` per TRD §7, all three entry points (manual drag, chat instruction, AI correction) routed through it.

🛑 **Verify before continuing:**
- [ ] Make one edit through each of the three entry points in the same session — confirm all three land correctly in the same working-copy JSON, and the original stays untouched.
- [ ] Trigger a structural correction (`isStructural: true`) — confirm the diff view appears rather than auto-applying.

---

## Step 11 — Insight injection

**Tasks:** per TRD §8.

🛑 **Verify before continuing:** 
- accept an insight, confirm it appears as a distinctly-styled node with a dotted line to the correct anchor topic, and shows up in `customInsights` in the exported JSON.

---

## Step 12 — ASCII drawing rendering

**Tasks:** `<pre>` block rendering, per `design.md`.

🛑 **Verify before continuing:** 
- ask for a simple diagram, confirm alignment holds in the rendered `<pre>` block. If it's frequently misaligned, revisit the prompt constraints in TRD §4.2 before moving on.

---

## Step 13 — Export/import round-trip

**Tasks:** all three export variants (bundling the chunk + embedding store per TRD §3.5), JSON re-import.

🛑 **Verify before continuing:** 
- export a session with edits and insights, re-import it in a fresh tab, confirm everything — including `modified` flags and `customInsights` — survives the round trip exactly.
-  After reimport, ask a chat question that requires retrieval — confirm RAG still works, i.e. the chunk store survived the round trip too, not just the graph.

---

## Step 14 — Final production polish & full walkthrough 
 
**Tasks:** final polish pass across all screens against `design.md`'s updated visual identity (§1), confirm environment variables and `maxDuration` config (TRD §12) are correctly set in production.
 
🛑 **Verify before continuing:** 
- full walkthrough on the live URL — upload, structure, chat, edit, export, reimport — before calling this done.