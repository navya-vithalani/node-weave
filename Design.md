# NodeWeave — Design Document

---

## 1. Visual identity

Retro terminal-*inspired*, not a literal command prompt. The goal is a hacker-adjacent, close-to-the-machine *feeling*, applied with warmth and richness so it's engaging to anyone, not just people who already like terminals. Think a well-designed terminal-themed game or portfolio site, not an actual shell window: populated rather than sparse, with soft glow effects and subtle gradients allowed where they add life, not a flat monochrome box.

Single-pixel outlines as a structural motif — but combined with depth: soft accent-colored glows on interactive elements, subtle gradient washes behind panels, and ASCII/pixel-art details used generously as decoration, not sparingly.

**No rounded corners on structural elements** (panels, buttons, nodes, progress bars) to keep the "boxy" terminal identity. Texture, color, and glow are fair game for visual interest.

**Dark mode only.** No light mode — the warm-dark aesthetic is the identity.

---

## 2. Color system

Dark mode palette (no light mode). All values are the actual CSS custom properties from `global.css`.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#1d2127` | App background |
| `--bg-elev` | `#222831` | Elevated surfaces |
| `--panel` | `#232830` | Card/modal backgrounds |
| `--panel-2` | `#2a323c` | Nested panel backgrounds |
| `--text` | `#f2efe8` | Primary text |
| `--muted` | `#8d95a3` | Secondary/label text |
| `--border` | `#2e353e` | Structural borders |
| `--border-soft` | `#252b33` | Subtle borders |
| `--cyan` | `#74d3ff` | Accent secondary (used sparingly) |
| `--magenta` | `#cf8bff` | Insight/custom node outlines |
| `--danger` | `#ff7b72` | Errors, destructive actions |

### Accent themes (v1 — 6 options)

The accent color (`--accent`, `--accent-hover`, `--accent-r`/`--accent-g`/`--accent-b`) is user-selectable via a theme picker. Selection persists in `localStorage`.

| Theme | `--accent` | `--hover` | RGB triplet |
|---|---|---|---|
| **Orange** (default) | `#e8b84d` | `#f6ca69` | `232, 184, 77` |
| **Purple** | `#a78bfa` | `#c4b5fd` | `167, 139, 250` |
| **Blue** | `#60a5fa` | `#93c5fd` | `96, 165, 250` |
| **Green** | `#34d399` | `#6ee7b7` | `52, 211, 153` |
| **Pink** | `#f472b6` | `#f9a8d4` | `244, 114, 182` |
| **Red** | `#f87171` | `#fca5a5` | `248, 113, 113` |

Semantic usage of `--accent`:
- Primary interactive elements (buttons, toggles, active states)
- Progress bar fill
- Brand cursor and typing cursor
- Focus rings (`:focus-visible`)
- Links on hover
- Text selection background
- Decorative glows and highlights
- Step separator marker (`::before` on step header)

All hardcoded `rgba(232,184,77, X)` values across the stylesheets have been replaced with `rgba(var(--accent-r), var(--accent-g), var(--accent-b), X)` so theme switching is consistent everywhere.

---

## 3. Typography

Multi-font approach — each face serves a distinct voice. No longer monospace-everywhere as originally planned.

| Font | CSS variable | Used for | Vibe |
|---|---|---|---|
| **Space Grotesk** | `--font-heading` | Step titles (h2), section headings | Clean, modern, slightly technical |
| **Inter** | `--font-body` | Body text, buttons, descriptions | Readable, neutral workhorse |
| **IBM Plex Mono** | `--font-mono` | Labels, terminal-label decorators, step header prefix | Clean monospace for UI chrome |
| **Press Start 2P** | `--font-pixel` | Brand title ("NodeWeave"), step eyebrow labels (`00 • WELCOME`) | Retro pixel accent — use sparingly for impact |
| **Smooch Sans** | `--font-friendly` | Welcome text (step 0), subtitle tagline | Warm, rounded, friendly — for introductory/copy moments |
| **Courier New** | (inline) | ASCII art panels, progress bar count | Classic typewriter terminal texture |

Font loading: all Google Fonts (Inter, IBM Plex Mono, Space Grotesk, Press Start 2P, Smooch Sans) are loaded via one `stylesheet` link in `index.html`. Courier New is a system font with no loading cost.

---

## 4. The Cat (recurring mascot)

A small ASCII cat face is used as a recurring mascot throughout the app. It first appears on the boot tutorial's progress bar, where it marks the boundary between filled and unfilled progress segments and bobs its head gently.

**Current form:**
```
 /\_/\
( ｡ꞈ｡ )
 > ^ <
```

**Design notes:**
- **Recurring** — the cat should appear in multiple contexts across the app (not just the tutorial), acting as a friendly winking presence
- **Resizable** — may be smaller or larger depending on available space. A single-line face (`/ᐠ｡ꞈ｡ᐟ\`) is used when space is tight
- **Animated** — the cat always has a subtle animation (head bob, blink, or idle wiggle) to make it feel alive
- **Accent-colored** — rendered in `var(--accent)` so it matches the current theme
- **Refinement needed** — the current cat form is a first pass. The exact ASCII should be iterated on as the cat appears in more places, but the *presence* of a cat mascot is a fixed design decision

---

## 5. Animation principles

Animations follow a **layered reveal** pattern. Not everything appears at once — content is distributed across a deliberate sequence.

### General rule: Background → Main title/headline → Paragraphs/description

Each component or page should reveal its content in this order:
1. **Background / container** (modal, panel, or page fades in)
2. **Main title / heading** (the key message appears first)
3. **Supporting text / description** (details follow)

The *exact* animation type (fade, slide, type, pop, etc.) may differ per component — the layering principle is fixed, not the specific technique.

### Boot tutorial animation sequence (reference implementation)

1. **Background overlay** fades in (0.45s)
2. **Modal** fades in slowly (1.2s)
3. **Corner brackets** — four dots at centre spread outward with ease-in acceleration (1.0s), then morph into L-shaped corner brackets (0.3s). The corner brackets are 2px thick and brighter than the modal border line
4. **All content** fades in from below (20px slide-up, 0.8s) — brand header, step header, progress bar, buttons appear together
5. **Step title** pops in word-by-word (each word fades in + scales up from 0.7× with a spring-like cubic-bezier)
6. **Description** types out character-by-character (cursor follows the active typing position)
7. On step change: only the typing resets — entry and reveal animations don't replay

### Progress bar animation
- Bar fill animates from 0% on first load
- Fills in 3 discrete segments per step phase (title typing → content typing → idle)
- Smooth CSS transition on width (0.45s cubic-bezier)
- Cat position tracks the bar boundary with the same easing

---

## 6. Keyboard navigation

Keyboard shortcuts should be used wherever practical to make the app fast to use without a mouse.

### Implemented (boot tutorial)
| Key | Action |
|---|---|
| `Escape` | Skip tutorial |
| `→` (ArrowRight) | Next step |
| `←` (ArrowLeft) | Previous step |

### Principle for future phases
Every interactive phase (uploader, dashboard, chat, canvas) should have keyboard shortcuts documented alongside its UI spec. Standard conventions apply (`Enter` to confirm, `Escape` to dismiss, `Tab` to navigate, arrow keys for spatial navigation).

---

## 7. Screen-by-screen spec

### Phase 1 — Boot-up tutorial modal

Centered box, single-pixel outline (`1px solid var(--border)`), background dimmed and blurred behind it. L-shaped corner brackets (2px, `rgba(255,255,255,.25)`) at each corner.

**5 steps (0-indexed):**

| Step | Eyebrow | Title | Notes |
|---|---|---|---|
| 0 | 00 • WELCOME | Welcome. | Accent-colored, italic, centered, Smooch Sans font |
| 1 | 01 • BUILD THE FIRST MAP | Let AI handle the first draft. | Standard styling |
| 2 | 02 • EXPLORE & RESHAPE | Your understanding comes first. | |
| 3 | 03 • PRIVATE BY DEFAULT | Your workspace belongs to you. | |
| 4 | 04 • PICK YOUR THEME | Make it yours. | Includes theme swatch picker that appears alongside the heading |

**Progress:** Full-width track bar (28px tall, sharp corners) with repeating gradient grain texture. 4 equal segments (steps 1-4, step 0 shows 0%). Dark gap blocks at 25%/50%/75% between segments. Filled portion in accent color with subtle bottom-left highlight (`inset box-shadow`). Bobbing cat mascot at the filled/empty boundary. Step count shows `X/4`.

**Controls:** `[ Skip ]` / `[ Continue → ]`, bottom-right. Last step shows `[ Enter Workspace → ]`.

### Phase 2 — Uploader (pending build)

*Original spec preserved below — design foundations from §§1-6 apply.*

Guide text:

- **a. PDF:** "Drop it directly — we extract the text automatically."
- **b. Slide deck (PowerPoint / Google Slides):** "Export or save your slides as a PDF (File → Export → PDF), then drop that here."
- **c. Web Article / Wikipedia Page:** "Install a free browser extension like 'MarkDownload' to save the page as a .md file, then drop it here."
- **d. YouTube video:** "Open the video's transcript (YouTube's 'Show transcript' option, or a free transcript tool), copy the text, paste it into a .txt file, and drop it here."
- **e. Handwritten notes:** "Scan the notes using any lens feature into a plain text file and drop it here."
- **f. Topic name only:** "Ask a free AI the following, and save the result as a .txt file:"
  > *"Give a comprehensive, textbook-depth explanation of [topic]..."*

Session name input. Dropzone: `accept=".txt,.md,.pdf"`. Separate "import previous session .json" option with validation. Continue button enabled once ≥1 file (or a validated JSON import) is present.

### Phase 3 — Loading screen (pending build)

Status log lines:

```
>>> INITIALIZING SYSTEM INGESTION... [OK]
>>> EXTRACTING TEXT FROM SOURCE PACKETS... [OK]
>>> CHUNKING METHOD EXECUTED: N INDEPENDENT SEGMENTS INDEXED.
>>> COMPUTING LOCAL EMBEDDINGS (IN-BROWSER)... [OK]
>>> PIPING CONTEXT TO COGNITIVE MODEL (GEMINI_3.6_FLASH)... [STREAMING STRUCTURAL JSON]
```

ASCII loop animation underneath, Courier New monospace. Layered reveal animation applies: log lines appear one-by-one, last line has a blinking cursor animation.

### Phase 4 — Dashboard (pending build)

**Navbar:** session name (left), export button (hover reveals: `export original structure` / `export custom structure` / `export both`).

**Left 66% — canvas:** top-right, hide/show subtopics toggle; top-left, canvas/raw-JSON view toggle; center, edit/view mode.

**Right 33% — chat sidebar:** question input, response stream, citation chips, "✨ Add insight" / "Reject" buttons, correction banner when `correctionFlag` is true, session AI-budget indicator, disclaimer line under every AI response.

---

## 8. Node/edge visual language (pending build)

- **Topic node:** solid single-pixel border, bold monospace title in Press Start 2P or Space Grotesk
- **Subtopic node:** lighter border weight, indented visually under its parent on expand
- **Insight node** (`customInsight`): magenta neon outline, small icon anchor (✨), connected to its topic via an animated dotted line
- **Modified node:** small accent-colored dot, top-right corner
- **Clustered supernode** (>8 subtopics): shows "N subtopics", click to expand
- **Correction banner:** distinct single-pixel box above the chat message, not blended into the normal answer bubble

---

## 9. Interaction patterns (pending build)

- Edit mode toggle switches the canvas from read-only to drag/connect-enabled; indicated by a border-color shift on the canvas frame, not just a button state
- Insight/correction accept-reject buttons disappear once acted on
- Fuzzy-match rule-based answers (post-budget-cap) are visually distinguished from AI answers — a `[LOOKUP]` tag prefix
- Keyboard shortcuts for all primary actions

---

## 10. Responsive & accessibility

- Dark-only colour palette with sufficient contrast ratios against gradient/glow backgrounds
- Keyboard-navigable across all phases (Tab/Enter/Escape throughout)
- All layout CSS uses flexbox/grid and relative units to keep a future mobile view cheap to add
- Responsive breakpoint below ~900px width stacks the 66/33 dashboard split vertically
- Mobile edit-mode touch interactions are not being designed for v1
