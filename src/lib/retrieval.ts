/**
 * Cosine-similarity retrieval for the client-side RAG pipeline (TRD §5.3)
 *
 * Given a query embedding and a corpus of chunk embeddings,
 * returns the top-K most similar chunks ranked by cosine similarity.
 */

import type { Chunk } from '../types/schema'

export interface RetrievalResult {
  chunk: Chunk
  score: number
}

/**
 * Compute cosine similarity between two vectors.
 * Vectors can be Float32Array or number[].
 */
function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  const len = Math.min(a.length, b.length)

  for (let i = 0; i < len; i++) {
    const ai = a[i]
    const bi = b[i]
    dotProduct += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dotProduct / denom
}

/**
 * Retrieve the top-K chunks most similar to the query embedding.
 *
 * @param queryEmbedding — the embedding vector of the user's query
 * @param chunks — the chunk store (each chunk must have its embedding populated)
 * @param k — number of results to return (default 5, per TRD §5.3)
 */
export function retrieveTopK(
  queryEmbedding: number[] | Float32Array,
  chunks: Chunk[],
  k: number = 5,
): RetrievalResult[] {
  if (chunks.length === 0) return []
  if (k <= 0) return []

  // Score every chunk
  const scored: RetrievalResult[] = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))

  // Sort descending by score, take top-K
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, Math.min(k, scored.length))
}

/**
 * Normalise a Float32Array to a plain number[] for JSON serialisation.
 */
export function embeddingToArray(embedding: Float32Array): number[] {
  return Array.from(embedding)
}

/**
 * Compute cosine similarity between two query strings by first converting
 * them to their stored embedding arrays.
 *
 * Thin wrapper — mostly useful for testing / diagnostics.
 */
export function compareChunks(a: Chunk, b: Chunk): number {
  return cosineSimilarity(a.embedding, b.embedding)
}