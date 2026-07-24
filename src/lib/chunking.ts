/**
 * Recursive semantic chunking for RAG pipeline (TRD §5.1)
 *
 * Strategy:
 *   1. Split on markdown heading boundaries (##, ###)
 *   2. Recursively split any chunk over ~500 tokens at paragraph boundaries
 *   3. Apply ~50-token overlap between adjacent chunks
 *   4. Target range: 300–500 tokens per chunk (~1200–2000 chars)
 */

// Rough token heuristic: ~4 chars per token for English prose
const CHARS_PER_TOKEN = 4
const TARGET_MAX_TOKENS = 500
const OVERLAP_TOKENS = 50

const TARGET_MAX_CHARS = TARGET_MAX_TOKENS * CHARS_PER_TOKEN    // ~2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN          // ~200

export interface Chunk {
  id: string
  docId: string
  text: string
}

/**
 * Split a document into chunks following the recursive semantic strategy.
 */
export function chunkDocument(docId: string, text: string): Chunk[] {
  const sections = splitByHeadings(text)
  const chunks: Chunk[] = []
  let chunkCounter = 0

  for (const section of sections) {
    const processed = recursiveChunk(section, TARGET_MAX_CHARS)
    for (const piece of processed) {
      chunks.push({
        id: `${docId}-chunk-${String(chunkCounter++).padStart(3, '0')}`,
        docId,
        text: piece,
      })
    }
  }

  // Apply overlap between adjacent chunks
  return applyOverlap(chunks)
}

// ── Heading split ────────────────────────────────────────────

/**
 * Split text on markdown headings (## or ###), preserving the heading
 * marker as part of the content. Returns an array of section strings.
 */
function splitByHeadings(text: string): string[] {
  // Normalise line endings
  const normalised = text.replace(/\r\n/g, '\n')

  // Match headings: lines starting with ## or ### (not # which could be a hash)
  const headingRegex = /^(#{2,3})\s+(.+)$/gm
  const sections: string[] = []
  let lastHeadingIndex = -1

  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(normalised)) !== null) {
    if (lastHeadingIndex >= 0) {
      sections.push(normalised.slice(lastHeadingIndex, match.index).trim())
    } else if (match.index > 0) {
      // Text before the first heading — treat as its own section
      const preamble = normalised.slice(0, match.index).trim()
      if (preamble) sections.push(preamble)
    }
    lastHeadingIndex = match.index
  }

  // Last section after the final heading
  if (lastHeadingIndex >= 0) {
    const tail = normalised.slice(lastHeadingIndex).trim()
    if (tail) sections.push(tail)
  } else {
    // No headings found — whole text is one section
    const trimmed = normalised.trim()
    if (trimmed) sections.push(trimmed)
  }

  return sections
}

// ── Recursive splitting ─────────────────────────────────────

/**
 * Recursively split text until all pieces are under maxChars.
 * Tries paragraph boundaries first, then sentence boundaries.
 */
function recursiveChunk(text: string, maxChars: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Within target range — keep as-is
  if (trimmed.length <= maxChars) return [trimmed]

  // Try paragraph split first
  const paragraphSplit = splitAtBoundary(trimmed, '\n\n', maxChars)
  if (paragraphSplit.length > 1) {
    return paragraphSplit.flatMap(p => recursiveChunk(p, maxChars))
  }

  // Try sentence split next
  const sentenceSplit = splitAtBoundary(trimmed, /(?<=[.!?])\s+/, maxChars)
  if (sentenceSplit.length > 1) {
    return sentenceSplit.flatMap(s => recursiveChunk(s, maxChars))
  }

  // Last resort: hard character split at maxChars
  return hardSplit(trimmed, maxChars)
}

/**
 * Split text at a given boundary pattern so each piece
 * is roughly maxChars wide, preferring boundaries near the limit.
 */
function splitAtBoundary(text: string, separator: string | RegExp, maxChars: number): string[] {
  const parts = text.split(separator).map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return [text]

  const merged: string[] = []
  let current = ''

  for (const part of parts) {
    if (!current) {
      current = part
    } else if ((current.length + part.length + 2) <= maxChars) {
      // Part fits — merge
      const sep = typeof separator === 'string' ? separator : '\n'
      current += sep + part
    } else {
      // Part would exceed — flush current and start new
      merged.push(current)
      current = part
    }
  }
  if (current) merged.push(current)

  return merged
}

/**
 * Hard split at character boundary — last resort when no natural
 * boundary is found near the limit.
 */
function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += maxChars) {
    pieces.push(text.slice(i, i + maxChars).trim())
  }
  return pieces.filter(Boolean)
}

// ── Overlap ──────────────────────────────────────────────────

/**
 * Apply ~50-token overlap between adjacent chunks by appending
 * the tail of each chunk to the start of the next.
 */
function applyOverlap(chunks: Chunk[]): Chunk[] {
  if (chunks.length <= 1) return chunks

  const result: Chunk[] = [{ ...chunks[0] }]

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const curr = chunks[i]

    // Take the last OVERLAP_CHARS from previous chunk
    const overlap = prev.text.slice(-OVERLAP_CHARS).trim()

    result.push({
      ...curr,
      text: overlap ? `${overlap}\n\n${curr.text}` : curr.text,
    })
  }

  return result
}