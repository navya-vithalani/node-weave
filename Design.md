# NodeWeave — Design Document

---

## 1. Visual identity

Retro terminal-*inspired*, not a literal command prompt. The goal is a hacker-adjacent, close-to-the-machine *feeling*, applied with warmth and richness so it's engaging to anyone, not just people who already like terminals. Think a well-designed terminal-themed game or portfolio site, not an actual shell window: populated rather than sparse, with soft glow effects and subtle gradients allowed where they add life, not a flat monochrome box.
 
Monospace font throughout (`ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace`), single-pixel outlines as a structural motif — but combined with depth: soft accent-colored glows on interactive elements, subtle gradient washes behind panels, and ASCII/pixel-art details used generously as decoration, not sparingly. No rounded corners on structural elements (panels, buttons, nodes) to keep the "boxy" identity, but texture and color are fair game.

**Color system** (dark mode default, light mode as toggle — concrete palette):

| | Dark | Light |
|---|---|---|
| Background | `#0a0a0a` | `#f4f4f0` |
| Primary text | `#e0e0e0` | `#111111` |
| Accent | `#39ff14` (terminal green) | `#006400` |
| Borders | `#333333` | `#cccccc` |

- **Insight nodes:** neon outline `#ff00ff` (magenta) in both modes, to stay visually distinct.
- **Modified-node marker:** small accent-colored dot, top-right corner of the node card (concrete choice — not discussed).

---

## 2. Screen-by-screen spec

### Phase 1 — Boot-up tutorial modal

Centered box, single-pixel outline, background dimmed/blurred behind it.

**Step 1 // SYSTEM DEFINITION**
> This platform converts raw unstructured document packets into interactive visual knowledge graphs combined with localized RAG context engines.

**Step 2 // MECHANICS**
> Double-click to expand nodes. Toggle to collapse subtopics. Drag lines manually to create custom relations.

**Step 3 // DATA SECURITY**
> Zero databases used. Your data is stored locally in your browser's RAM. Remember to export your workspace before terminating your browser session. Note: when you ask a question, your source material and query are sent to the AI provider to generate an answer — nothing is stored on our end or tied to an account.

Controls: `[ SKIP_TUTORIAL ]` / `[ NEXT_STEP > ]`, bottom right.

### Phase 2 — Uploader

Guide text:

- **a. PDF:** "Drop it directly — we extract the text automatically."
- **b. Slide deck (PowerPoint / Google Slides):** "Export or save your slides as a PDF (File → Export → PDF), then drop that here."
- **c. Web Article / Wikipedia Page:** "Install a free browser extension like 'MarkDownload' to save the page as a .md file, then drop it here."
- **d. YouTube video:** "Open the video's transcript (YouTube's 'Show transcript' option, or a free transcript tool), copy the text, paste it into a .txt file, and drop it here."
- **e. Handwritten notes: [ADDED — split out from "topic name," was previously merged]** "Scan the notes using any lens feature into a plain text file and drop it here." *(A future version may accept a photo directly — see TRD §4.3 — but that's not part of this build.)*
- **f. Topic name only:** "Ask a free AI the following, and save the result as a .txt file:"
  > *"Give a comprehensive, textbook-depth explanation of [topic]. Cover the core definitions, the underlying mechanisms or reasoning, how the major sub-ideas connect to each other, common points of confusion, and at least one worked example or concrete illustration. Write it as continuous prose, not bullet points, organized in a logical teaching order from fundamentals to more advanced points. Aim for depth over brevity — assume the reader wants to actually understand this deeply, not skim a summary."*

Session name input. Dropzone: `[ DRAG_DATA_PACKET_HERE_OR_CLICK_TO_BROWSE ]`, `accept=".txt,.md,.pdf"`. Separate "import previous session .json" option. on selecting a JSON file, run validation (TRD §13) before enabling continue; show a clear inline error if the file doesn't match the expected structure, rather than failing silently or crashing. Continue button enabled once ≥1 file (or a validated JSON import) is present.

### Phase 3 — Loading screen

Status log lines (updated to reflect the real pipeline, including the client-side embedding step not in the original draft):

```
>>> INITIALIZING SYSTEM INGESTION... [OK]
>>> EXTRACTING TEXT FROM SOURCE PACKETS... [OK]
>>> CHUNKING METHOD EXECUTED: N INDEPENDENT SEGMENTS INDEXED.
>>> COMPUTING LOCAL EMBEDDINGS (IN-BROWSER)... [OK]
>>> PIPING CONTEXT TO COGNITIVE MODEL (GEMINI_2.5_FLASH)... [STREAMING STRUCTURAL JSON]
```

ASCII loop animation underneath, inside a `<pre>` block, monospace.

### Phase 4 — Dashboard

**Navbar:** session name (left), light/dark toggle, export button (hover reveals: `export original structure` / `export custom structure` / `export both`).

**Left 66% — canvas:** top-right, hide/show subtopics toggle; top-left, canvas/raw-JSON view toggle; center, edit/view mode.

**Right 33% — chat sidebar:** question input, response stream, citation chips (rendered from `sourceIds`), "✨ Add insight" / "Reject" buttons under insight-worthy responses, correction banner when `correctionFlag` is true, session AI-budget indicator (e.g. "23/40 this session"), disclaimer line under every AI response:
> "AI-generated — may be inaccurate. Always cross-check against your original sources."

---

## 3. Node/edge visual language

- **Topic node:** solid single-pixel border, bold monospace title.
- **Subtopic node:** lighter border weight, indented visually under its parent on expand.
- **Insight node** (`customInsight`): magenta neon outline, small icon anchor (✨), connected to its topic via an animated dotted line.
- **Modified node:** small accent-colored dot, top-right corner (see §1).
- **Clustered supernode** (>8 subtopics, per TRD §9): shows "N subtopics", click to expand into individuals.
- **Correction banner:** distinct amber single-pixel box above the chat message, not blended into the normal answer bubble.

---

## 4. Interaction patterns

- Edit mode toggle switches the canvas from read-only to drag/connect-enabled; indicated by a border-color shift on the canvas frame, not just a button state.
- Insight/correction accept-reject buttons disappear once acted on — no lingering stale prompts.
- Fuzzy-match rule-based answers (post-budget-cap) are visually distinguished from AI answers — a `[LOOKUP]` tag prefix instead of the AI disclaimer line, so the user always knows which mode answered them.

---

## 5. Accessibility & visual accessibility of the aesthetic
 
The terminal aesthetic is meant to draw *anyone* in and feel distinctive, not filter for people who already like command lines. That makes accessibility more important — a broadly engaging product needs to actually be usable broadly.
 
Baseline commitments: sufficient color contrast in both palettes (including against any gradient/glow backgrounds — contrast gets checked against the actual rendered background, not just the base color), keyboard-navigable modal and upload controls (tab/enter throughout), and a responsive breakpoint that stacks the 66/33 dashboard split vertically below ~900px width rather than breaking layout.
 
**Mobile, as a deliberate future direction (not v1):** build all layout CSS using flexbox/grid and relative units from the start, even though mobile isn't a v1 target — this keeps a future "view-only mobile mode" (browsing the graph and chatting, no drag-editing) cheap to add later, rather than requiring a rebuild. Edit-mode touch interactions are explicitly not being designed for now; see PRD §10.
 