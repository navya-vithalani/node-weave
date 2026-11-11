# NodeWeave — Technical Requirements Document (TRD)

---

## 1. Architecture overview

Single Vercel monorepo. Frontend (React + Vite) and backend (Vercel serverless functions under `/api`) deploy together, same origin — no CORS handling needed. **No database anywhere in the stack.** All durable state lives in the browser (React state + localStorage) and in exported JSON files. The backend's only job on every call: receive a request, attach the server-side AI API key, forward to Gemini Flash (primary) or Groq (fallback), return the response. It holds no state between calls.

```
/nodeweave
  /api
    structure.ts        # POST — multi-doc consolidation structuring call
    chat.ts              # POST — RAG-grounded chat call
  /src
    /components
    /styles
    /lib
      chunking.ts
      embeddings.ts
      retrieval.ts
      layout.ts          # elkjs wrapper
      budget.ts          # session AI-call cap + rule-based fallback
      edits.ts           # unified applyEdit() pipeline
      storage.ts         # localStorage read/write helpers
      validation.ts      # validateSessionJson() for imports, see §13
    /types
      schema.ts           # shared TS types for the JSON structures below
  vercel.json
  .env.example
  package.json
```

UI/logic separation rule: components in /components only ever import CSS from /styles (one file per component or per screen, matching design.md's token names) and never contain business logic beyond rendering + calling functions from /lib. Added specifically so UI iteration doesn't require touching logic code.
---

## 2. Stack (final)

| Layer | Choice | 
|---|---|
| Language | TypeScript | 
| Frontend | React + Vite | 
| Graph canvas | React Flow | 
| Graph layout | elkjs only | 
| Styling | Native CSS |
| Backend | Vercel serverless functions, native handlers | 
| Deployment | Single Vercel monorepo | 
| AI | Gemini Flash (primary), Groq (fallback) | 
| Embeddings | transformers.js, client-side |
| RAG | Client-side chunking + client-side embedding search(chunks/embeddings never bundled to the backend)
| File parsing | pdf.js (client-side) + native FileReader | 
| HTTP | native `fetch` | 
| CORS | none needed |
| Persistence | Browser localStorage + exported JSON(no database) |

---

## 3. Data models

### 3.1 Structured knowledge JSON (AI-authored, immutable "original")

```json
{
  "sessionName": "string",
  "createdAt": "ISO8601 string",
  "topics": [
    {
      "id": "string, e.g. 'electrostatics'",
      "name": "string",
      "summary": "string, 3-4 lines",
      "subtopics": [
        {
          "id": "string, e.g. 'electrostatics.01'",
          "name": "string",
          "summary": "string",
          "points": ["string", "..."],
          "sourceRefs": ["chunk ids this subtopic was derived from"]
        }
      ]
    }
  ],
  "connections": [
    { "id": "string", "source": "topic/subtopic id", "target": "topic/subtopic id", "link": "string explaining the relation" }
  ]
}
```

> `sourceRefs` added so the correction flow (§7) and citation display can trace a subtopic back to the chunks it came from, not just the raw source document.


> `connections` this array holds only explicit cross-topic/cross-subtopic relations discovered by the AI — it does not include the implicit parent→child relation of a topic to its own subtopics. That hierarchy is already expressed by nesting and is synthesized into edges separately during flattening (§3.3). This keeps the structuring prompt focused on finding genuinely non-obvious links rather than restating the tree it already produced.

### 3.2 Edited/working JSON (copy-on-write, mutable)

Same shape as 3.1, plus:

```json
{
  "modified": true,
  "customInsights": [
    {
      "id": "string",
      "name": "string",
      "summary": "string",
      "anchorTopicId": "string — topic/subtopic this insight is linked to",
      "createdAt": "ISO8601 string"
    }
  ]
}
```

`customInsights` sits parallel to `subtopics` under its parent topic, matching the original spec. Every topic/subtopic/connection object also gets a `modified: boolean` flag, defaulting to absent/false, set `true` the first time any edit pipeline touches it.

### 3.3 Flattened render JSON (derived, in-memory only, never persisted)

```json
{
  "nodes": [{ "id": "string", "type": "topic|subtopic|customInsight", "name": "string", "summary": "string", "modified": "boolean" }],
  "edges": [{ "id": "string", "source": "string", "target": "string", "link": "string" }]
}
```

> `edges` here is synthesized from two sources at flatten time: (1) every entry in the original JSON's `connections` array, copied through as-is, and (2) an auto-generated edge for every topic→subtopic relation, using the default link text `"hierarchical relation"`. This is what makes it safe for `connections` (§3.1) to hold only genuine cross-topic links — the tree structure gets its edges back at flatten time, not stored twice.

### 3.4 Chunk + embedding store (client-side only)

```json
{
  "chunks": [
    { "id": "string", "docId": "string", "text": "string", "embedding": "float array" }
  ]
}
```

### 3.5 Export payload composition **[ADDED — new subsection, closes a gap]**
 
To keep chat/RAG functional after a reimport, every export variant bundles the chunk + embedding store (§3.4) alongside the structure JSON — otherwise a reimported session would have a graph but nothing for retrieval to search against, since the raw source text is never saved anywhere else.
 
- **Export original structure:** §3.1 JSON + chunk store.
- **Export custom structure:** §3.2 JSON + chunk store.
- **Export both:** both structure JSONs + one shared chunk store (chunks don't change between original/edited, only the graph does).
---

## 4. AI call contracts

### 4.1 `POST /api/structure` — consolidation structuring call

**Request:**
```json
{ "documents": [{ "id": "string", "text": "string" }] }
```

**System prompt (exact, to remove ambiguity for the build agent):**

> You are structuring raw study material into a hierarchical knowledge graph. You must analyse relations between various topics, even if not explicitly mentioned in the sources. You will receive one or more source documents that may cover overlapping topics, use different terminology for the same ideas, or vary in depth. Where sources overlap, merge them into one topic/subtopic and combine their unique points. Where sources conflict, keep both claims and note the discrepancy in the summary rather than silently picking one. Output ONLY valid JSON matching the given schema. No prose, no markdown fences, no commentary outside the JSON.

**Response:** JSON matching §3.1.

**Multi-call splitting rule:** if combined document text exceeds roughly 150K tokens (leaving headroom under Gemini Flash's context window for prompt and output), split into sequential structuring calls by document, then run a final consolidation pass over the resulting partial JSONs.

### 4.2 `POST /api/chat` — RAG-grounded chat call

**Request:**
```json
{
  "query": "string",
  "retrievedChunks": [{ "id": "string", "text": "string" }],
  "relevantJsonSlice": "the topic/subtopic branch the query relates to, from §3.2",
  "chatHistory": [{ "role": "user|assistant", "content": "string" }]
}
```

**System prompt (exact):**

> Answer only using the provided source chunks and knowledge graph slice. If the questions explicitly asks for a 'diagram' or 'drawing', or if the answer would be more complete with a visual, include ASCII-art instructions in the `asciiDrawing` field of your response.. If the answer isn't present in either, respond with exactly: "This isn't covered in your uploaded material." Do not use outside knowledge, even if you know the answer. Prefer saying you don't know over inventing a plausible-sounding answer. If the source chunks contradict the knowledge graph slice on a specific point, note this as a correction candidate rather than silently picking one. Return ONLY valid JSON matching the given schema. No prose outside the JSON.

**Response schema (field names formalized here — discussed conceptually, not at this level of detail):**

```json
{
  "answer": "string",
  "sourceIds": ["topic/subtopic id(s) the answer draws from — empty array if ungrounded"],
  "isInsightWorthy": "boolean",
  "insightText": "string | null",
  "asciiDrawing": "string | null",
  "correctionFlag": "boolean",
  "correction": {
    "targetId": "string | null",
    "issue": "string | null",
    "suggestedFix": "string | null",
    "isStructural": "boolean | null"
  }
}
```

**Model config:** temperature `0.2`, streaming enabled (see §12).

---

## 5. RAG pipeline (client-side)

### 5.1 Chunking

Recursive/semantic chunking, not naive paragraph splitting: split first on heading/structural boundaries where detectable (markdown headers, obvious section breaks), then recursively split any resulting chunk over ~500 tokens at the nearest paragraph boundary. **Target 300–500 token chunks with ~50-token overlap** between adjacent chunks. Runs entirely in `lib/chunking.ts`.

### 5.2 Embeddings

`transformers.js`, model **`Xenova/all-MiniLM-L6-v2`** (picked for being small enough to run smoothly in-browser via WASM while giving solid retrieval quality; swappable in `lib/embeddings.ts` if quality testing suggests otherwise).

### 5.3 Retrieval

Cosine similarity between the query embedding and all chunk embeddings for the active session; return **top 5** chunks (K=5). All embeddings live in memory and are cached in the exported session JSON's chunk store so a reopened session never re-embeds.

### 5.4 Mid-session document addition (explicitly deferred)

Not built in v1. If revisited later: send the current structured JSON plus the new document's text to `/api/structure` in an "extend" mode, prompted to merge into existing topics rather than duplicate, and flag genuinely new top-level topics. Documented here only so the build agent doesn't attempt this prematurely.

---

## 6. Hallucination mitigation

1. Strict system prompt (§4.2) instructing refusal over invention.
2. Full retrieved source chunks passed alongside the JSON slice, never the JSON slice alone.
3. Temperature 0.2.
4. Every answer must include `sourceIds`; if empty, the frontend renders a visible "⚠ couldn't verify this against your sources" tag.
5. Standard AI-disclaimer text under every chat response (exact copy in `design.md`).

---

## 7. Unified editing pipeline

Three entry points write to the same working-copy JSON (§3.2), never the original (§3.1):

1. **Manual canvas edit** (drag node position, draw/delete a connection) — direct client-side mutation of the working copy.
2. **Chat-instructed edit** ("connect X and Y because...") — parsed from a chat response's structured fields; same apply function as #3.
3. **AI-detected correction** — a chat response with `correctionFlag: true` renders a banner with `issue` and a "Fix this" button.

**Auto-apply vs. diff-confirm rule:** if `correction.isStructural` is `false` (the fix only edits an existing `summary` or `points` field), auto-apply on click. If `isStructural` is `true` (adding/removing a node or connection), show a before/after diff view and require explicit confirmation before applying.

All three entry points funnel through one `applyEdit()` function in `lib/edits.ts`, so the copy-on-write and `modified`-flagging logic exists in exactly one place.

---

## 8. Insight injection

Separate from corrections. On `isInsightWorthy: true`, render "✨ Add to canvas" / "Reject" under the chat message. On accept: create a `customInsight` node (schema §3.2), append to the parent topic's `customInsights` array, and add a rendered dotted animated connecting line from the insight node to `anchorTopicId` in the flattened render graph.

---

## 9. Rendering & performance

1. **Lazy rendering, eager structuring** — the full nested JSON is generated in one pass (§4.1); only the currently-expanded branch is flattened into React Flow nodes/edges and laid out. Expanding a node is a synchronous local JSON lookup, not a network call.
2. React Flow `onlyRenderVisibleElements: true` once a session exceeds roughly **50 total nodes**.
3. elkjs layout recomputed only for the currently-expanded subgraph on each expand/collapse, not the whole tree.
4. **Clustering threshold (concrete, not discussed):** if a single topic has more than **8 subtopics**, collapse them into a supernode ("12 subtopics") by default, expandable on click.

---

## 10. Session AI-budget cap & fallback

- Tracked client-side, in-memory + mirrored to localStorage, as a simple request counter.
- **Default cap: 40 `/api/chat` calls per session**. `/api/structure` calls never count against this — structuring is a one-time per-document cost, not a per-session chat cost.
- **Session boundary:** a session resets when the user uploads a fresh document set; re-opening an exported JSON in a new browser tab starts a fresh counter rather than resuming the old one, since there's no server to track cumulative usage across time. Worth flagging to yourself during the build if this feels wrong in practice.
- **On exhaustion:** chat input switches to rule-based mode. Query is matched against topic/subtopic `name` fields using **simple token-overlap fuzzy matching**. The best-scoring match above a minimal threshold returns its existing `summary`/`points` verbatim. No match above threshold → exact copy: *"This isn't in your uploaded material. Try asking about something already in your map."*

---

## 11. Security & privacy

- AI API keys live only in Vercel environment variables, read server-side inside `/api` functions, never exposed to the client bundle.
- No auth, no server-side user data, no server-side logging of document content beyond standard Vercel request logs.

---

## 12. Deployment

- Single Vercel project, monorepo, `/api` functions auto-detected.
- **Streaming + duration:** both `/api/chat` and `/api/structure` stream responses (needed since Vercel Hobby's default 10s non-streaming cap could be tight for a large consolidation call). Set `export const maxDuration = 60` in both function files, relying on Fluid Compute's extended streaming ceiling on the free tier.
- `.env.example`:
```
GEMINI_API_KEY=
GROQ_API_KEY=
```
- No database, no external services beyond the two AI providers.

## 13. Import validation & session override
 
**Flow:**
1. On import, run `lib/validation.ts`'s `validateSessionJson()` against the file: confirm required top-level fields exist (`topics`, `connections`, etc. — matching §3.1/§3.2 shape), confirm types are correct, confirm all `id` values are unique.
2. **If valid:** load the file directly as the working-copy JSON (§3.2), skipping the AI structuring step entirely — it's already structured. If the file also includes a chunk store (§3.5), load that too so chat/RAG works immediately; if not (e.g. an older export or hand-edited file), disable chat until a fresh document is uploaded, or show a clear notice that RAG isn't available for this imported session.
3. **If invalid:** block the "continue" action and show a clear, specific error (e.g. "This file is missing a `topics` field — is this a NodeWeave export?") rather than a generic failure or a crash.