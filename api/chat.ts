import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/chat — RAG-grounded chat call (TRD §4.2)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, retrievedChunks, relevantJsonSlice, chatHistory } = req.body

    if (!query) {
      return res.status(400).json({ error: 'query is required' })
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
    }

    const systemPrompt = `Answer only using the provided source chunks and knowledge graph slice. If the question explicitly asks for a 'diagram' or 'drawing', or if the answer would be more complete with a visual, include ASCII-art instructions in the \`asciiDrawing\` field of your response. If the answer isn't present in either, respond with exactly: "This isn't covered in your uploaded material." Do not use outside knowledge, even if you know the answer. Prefer saying you don't know over inventing a plausible-sounding answer. If the source chunks contradict the knowledge graph slice on a specific point, note this as a correction candidate rather than silently picking one. Return ONLY valid JSON matching the given schema. No prose outside the JSON.

Respond with a JSON object of this exact shape:
{
  "answer": "string",
  "sourceIds": ["topic/subtopic id(s)"],
  "isInsightWorthy": false,
  "insightText": null,
  "asciiDrawing": null,
  "correctionFlag": false,
  "correction": {
    "targetId": null,
    "issue": null,
    "suggestedFix": null,
    "isStructural": null
  }
}`

    const userPrompt = JSON.stringify({
      query,
      retrievedChunks,
      relevantJsonSlice,
      chatHistory,
    })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }, { text: userPrompt }] },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', geminiRes.status, errText)

      // Fallback to Groq if available
      const GROQ_API_KEY = process.env.GROQ_API_KEY
      if (GROQ_API_KEY) {
        const groqRes = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'mixtral-8x7b-32768',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.2,
              max_tokens: 4096,
            }),
          },
        )

        if (groqRes.ok) {
          const groqData = await groqRes.json()
          const text = groqData?.choices?.[0]?.message?.content
          if (text) {
            const cleaned = text.replace(/^```(?:json)?\s*\n?|```$/g, '').trim()
            return res.status(200).json(JSON.parse(cleaned))
          }
        }
      }

      return res.status(502).json({ error: 'AI provider error', detail: errText })
    }

    const geminiData = await geminiRes.json()
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return res.status(502).json({ error: 'Empty AI response' })
    }

    const cleaned = text.replace(/^```(?:json)?\s*\n?|```$/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('Chat endpoint error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const maxDuration = 60
