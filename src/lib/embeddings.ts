/**
 * Client-side embedding generation using transformers.js (TRD §5.2)
 *
 * Uses Xenova/all-MiniLM-L6-v2 — a small, fast model ideal for
 * in-browser execution via WASM. Model is lazily loaded on first call.
 *
 * The model is swappable — just change the MODEL_NAME constant.
 */

import { pipeline } from '@xenova/transformers'
import type { FeatureExtractionPipeline } from '@xenova/transformers'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'

let extractor: FeatureExtractionPipeline | null = null
let loadPromise: Promise<FeatureExtractionPipeline> | null = null

/**
 * Get or lazily initialise the feature extraction pipeline.
 * Subsequent calls reuse the already-loaded model.
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor

  if (!loadPromise) {
    loadPromise = pipeline('feature-extraction', MODEL_NAME) as Promise<FeatureExtractionPipeline>
  }

  extractor = await loadPromise
  return extractor
}

/**
 * Generate an embedding vector for the given text.
 * Returns a Float32Array of 384 dimensions (all-MiniLM-L6-v2 output).
 */
export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await getExtractor()

  const result = await pipe(text, {
    pooling: 'mean',
    normalize: true,
  })

  return result.data as Float32Array
}

/**
 * Generate embeddings for multiple texts in one batch.
 * More efficient than calling embedText() in a loop.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getExtractor()

  const result = await pipe(texts, {
    pooling: 'mean',
    normalize: true,
  })

  // result.data is a flat Float32Array; result.dims tells us the shape
  const dims = result.dims as number[]  // [batch, vector_size]
  const vectorSize = dims[1]
  const embeddings: Float32Array[] = []

  for (let i = 0; i < texts.length; i++) {
    const start = i * vectorSize
    embeddings.push(result.data.slice(start, start + vectorSize) as Float32Array)
  }

  return embeddings
}