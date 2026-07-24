// Shared TypeScript types for NodeWeave data structures (TRD §3)

export interface Topic {
  id: string
  name: string
  summary: string
  subtopics: Subtopic[]
  customInsights?: CustomInsight[]
  modified?: boolean
}

export interface Subtopic {
  id: string
  name: string
  summary: string
  points: string[]
  sourceRefs: string[]
  discrepancy?: string
  modified?: boolean
}

export interface Connection {
  id: string
  source: string
  target: string
  link: string
  modified?: boolean
}

export interface CustomInsight {
  id: string
  name: string
  summary: string
  anchorTopicId: string
  createdAt: string
}

// §3.1 — AI-authored, immutable original structure
export interface OriginalStructure {
  sessionName: string
  createdAt: string
  topics: Topic[]
  connections: Connection[]
}

// §3.2 — Edited/working copy (copy-on-write, mutable)
export interface WorkingStructure extends OriginalStructure {
  modified: true
  customInsights: CustomInsight[]
}

// §3.3 — Flattened render JSON (in-memory only, never persisted)
export interface RenderNode {
  id: string
  type: 'topic' | 'subtopic' | 'customInsight'
  name: string
  summary: string
  modified?: boolean
}

export interface RenderEdge {
  id: string
  source: string
  target: string
  link: string
}

export interface FlattenedGraph {
  nodes: RenderNode[]
  edges: RenderEdge[]
}

// §3.4 — Chunk + embedding store (client-side only)
export interface Chunk {
  id: string
  docId: string
  text: string
  embedding: number[]
}

export interface ChunkStore {
  chunks: Chunk[]
}

// §3.5 — Export payload
export interface ExportPayload {
  original?: OriginalStructure
  working?: WorkingStructure
  chunkStore: ChunkStore
}

// §4.1 — /api/structure
export interface StructureRequest {
  documents: { id: string; text: string }[]
}

// §4.2 — /api/chat
export interface ChatRequest {
  query: string
  retrievedChunks: { id: string; text: string }[]
  relevantJsonSlice: string
  chatHistory: { role: 'user' | 'assistant'; content: string }[]
}

export interface ChatResponse {
  answer: string
  sourceIds: string[]
  isInsightWorthy: boolean
  insightText: string | null
  asciiDrawing: string | null
  correctionFlag: boolean
  correction: {
    targetId: string | null
    issue: string | null
    suggestedFix: string | null
    isStructural: boolean | null
  }
}
