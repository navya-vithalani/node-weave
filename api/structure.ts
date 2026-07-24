import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/structure — multi-doc consolidation structuring call (TRD §4.1)

const SYSTEM_PROMPT = `You are structuring raw study material into a hierarchical knowledge graph. You must analyse relations between various topics, even if not explicitly mentioned in the sources. You will receive one or more source documents that may cover overlapping topics, use different terminology for the same ideas, or vary in depth. Where sources overlap, merge them into one topic/subtopic and combine their unique points. Where sources conflict, keep both claims and note the discrepancy in the summary rather than silently picking one. Output ONLY valid JSON matching the given schema. No prose, no markdown fences, no commentary outside the JSON.`

const CONSOLIDATION_PROMPT = `You are consolidating partial knowledge graphs into one unified structure. You will receive several JSON structures, each produced from a different subset of source documents. Merge them into a single coherent hierarchical knowledge graph. Where topics overlap across partial structures, merge them into one topic/subtopic and combine their unique points. Where the same idea uses different terminology, unify under the most precise term. Where sources conflict, keep both claims and note the discrepancy in the summary. Output ONLY valid JSON matching the given schema. No prose, no markdown fences, no commentary outside the JSON.`

const TARGET_SCHEMA = `{
  "sessionName": "string",
  "createdAt": "ISO8601 string",
  "topics": [
    {
      "id": "string",
      "name": "string",
      "summary": "string, 3-4 lines",
      "subtopics": [
        {
          "id": "string",
          "name": "string",
          "summary": "string",
          "points": ["string", "..."],
          "sourceRefs": ["chunk ids"]
        }
      ]
    }
  ],
  "connections": [
    { "id": "string", "source": "topic/subtopic id", "target": "topic/subtopic id", "link": "string explaining the relation" }
  ]
}`

// Rough token estimate: ~4 characters per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const TOKEN_LIMIT = 150_000

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }, { text: userContent }] },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    console.error('Gemini API error:', res.status, errText)
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('Empty AI response')
  }

  // Strip markdown fences if present
  return text.replace(/^```(?:json)?\s*\n?|```$/g, '').trim()
}

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('AI returned invalid JSON')
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { documents } = req.body

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'documents array is required and must be non-empty' })
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
    }

    // Estimate total token count across all documents
    const totalTokens = documents.reduce((sum, d) => sum + estimateTokens(d.text || ''), 0)

    // Multi-call splitting rule (TRD §4.1):
    // If combined text exceeds ~150K tokens, split into sequential structuring calls
    // by document, then run a final consolidation pass over the partial results.
    if (totalTokens > TOKEN_LIMIT && documents.length > 1) {
      console.log(`Total ~${totalTokens} tokens exceeds ${TOKEN_LIMIT}, using multi-call strategy`)

      // Phase 1: Structure each document independently
      const partialResults: any[] = []
      for (const doc of documents) {
        const userContent = JSON.stringify({
          documents: [doc],
          instruction: `Analyse this document and produce a hierarchical knowledge graph as a JSON object with exactly this shape:\n${TARGET_SCHEMA}`,
        })

        const raw = await callGemini(GEMINI_API_KEY, SYSTEM_PROMPT, userContent)
        const parsed = parseJsonSafe(raw)
        partialResults.push(parsed)
      }

      // Phase 2: Consolidate all partial structures into one final graph
      const consolidationInput = JSON.stringify({
        partialStructures: partialResults.map((p, i) => ({
          sourceDocIndex: i,
          structure: p,
        })),
        instruction: `Merge the above partial knowledge graphs into one unified structure following this schema:\n${TARGET_SCHEMA}`,
      })

      const finalRaw = await callGemini(GEMINI_API_KEY, CONSOLIDATION_PROMPT, consolidationInput)
      const final = parseJsonSafe(finalRaw)

      return res.status(200).json(final)
    }

    // Single call: all documents fit in one pass
    const userContent = JSON.stringify({
      documents,
      instruction: `Analyse the provided documents and produce a hierarchical knowledge graph as a JSON object with exactly this shape:\n${TARGET_SCHEMA}`,
    })

    const raw = await callGemini(GEMINI_API_KEY, SYSTEM_PROMPT, userContent)
    const parsed = parseJsonSafe(raw)

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('Structure endpoint error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return res.status(500).json({ error: message })
  }
}

export const maxDuration = 60
