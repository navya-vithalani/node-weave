import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/structure — multi-doc consolidation structuring call (TRD §4.1)
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

    const systemPrompt = `You are structuring raw study material into a hierarchical knowledge graph. You must analyse relations between various topics, even if not explicitly mentioned in the sources. You will receive one or more source documents that may cover overlapping topics, use different terminology for the same ideas, or vary in depth. Where sources overlap, merge them into one topic/subtopic and combine their unique points. Where sources conflict, keep both claims and note the discrepancy in the summary rather than silently picking one. Output ONLY valid JSON matching the given schema. No prose, no markdown fences, no commentary outside the JSON.`

    const userPrompt = JSON.stringify({
      documents,
      instruction: `Analyse the provided documents and produce a hierarchical knowledge graph as a JSON object with exactly this shape:
{
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
}`,
    })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }, { text: userPrompt }] },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', geminiRes.status, errText)
      return res.status(502).json({ error: 'AI provider error', detail: errText })
    }

    const geminiData = await geminiRes.json()
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return res.status(502).json({ error: 'Empty AI response' })
    }

    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?|```$/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('Structure endpoint error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const maxDuration = 60
