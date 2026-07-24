/**
 * Test runner for /api/structure
 *
 * Reads every .md and .txt file from test-data/, sends them to the
 * /api/structure endpoint, and prints the resulting knowledge graph.
 *
 * Usage:
 *   node test-structure.js [url]
 *
 *   url — the deployed /api/structure endpoint.
 *         Defaults to http://localhost:5173/api/structure if omitted.
 *
 * Examples:
 *   node test-structure.js
 *   node test-structure.js https://nodeweave.vercel.app/api/structure
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DATA_DIR = path.join(__dirname, 'test-data')
const API_URL = process.argv[2] || 'http://localhost:5173/api/structure'

async function main() {
  // Discover test files
  const files = fs.readdirSync(TEST_DATA_DIR)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .sort()

  if (files.length === 0) {
    console.error('No .md or .txt files found in test-data/')
    console.error('Add some files there and try again.')
    process.exit(1)
  }

  console.log(`\n  ╔══════════════════════════════════════════╗`)
  console.log(`  ║     NodeWeave — Structure Test Runner     ║`)
  console.log(`  ╚══════════════════════════════════════════╝\n`)
  console.log(`  Endpoint: ${API_URL}`)
  console.log(`  Files found: ${files.length}\n`)

  const documents = files.map((f) => {
    const content = fs.readFileSync(path.join(TEST_DATA_DIR, f), 'utf-8')
    const id = f.replace(/\.(md|txt)$/, '')
    console.log(`  [${id.padEnd(30)}] ${content.length.toString().padStart(6)} chars`)
    return { id, text: content }
  })

  const totalChars = documents.reduce((sum, d) => sum + d.text.length, 0)
  console.log(`\n  Total: ${totalChars} characters (~${Math.ceil(totalChars / 4)} tokens)\n`)
  console.log(`  ── Sending request...\n`)

  const start = Date.now()

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
  })

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  if (!res.ok) {
    const text = await res.text()
    console.error(`  ❌ HTTP ${res.status} after ${elapsed}s`)
    console.error(`  ${text.slice(0, 1000)}`)
    process.exit(1)
  }

  const data = await res.json()
  console.log(`  ✅ ${res.status} in ${elapsed}s\n`)

  // Print summary
  console.log(`  Session:      ${data.sessionName || '(not set)'}`)
  console.log(`  Topics:       ${data.topics?.length || 0}`)
  console.log(`  Connections:  ${data.connections?.length || 0}\n`)

  if (data.topics) {
    for (const topic of data.topics) {
      const subCount = topic.subtopics?.length || 0
      console.log(`  ── ${topic.name}`)
      console.log(`     ${subCount} subtopics`)
      if (topic.summary) {
        console.log(`     ${topic.summary.slice(0, 120)}${topic.summary.length > 120 ? '…' : ''}`)
      }
      console.log()
    }
  }

  if (data.connections?.length > 0) {
    console.log(`  ── Cross-topic connections`)
    for (const conn of data.connections) {
      console.log(`     ${conn.source} → ${conn.target}: ${conn.link?.slice(0, 80)}`)
    }
    console.log()
  }

  // Check for conflict notes in summaries
  const conflictTerms = ['discrep', 'conflict', 'disagree', 'contradict', 'both view', 'alternative', 'according to some']
  const conflictHits = []

  for (const topic of data.topics || []) {
    for (const term of conflictTerms) {
      if (topic.summary?.toLowerCase().includes(term)) {
        conflictHits.push({ topic: topic.name, snippet: topic.summary.slice(0, 150) })
        break
      }
      for (const sub of topic.subtopics || []) {
        if (sub.summary?.toLowerCase().includes(term)) {
          conflictHits.push({ topic: `${topic.name} > ${sub.name}`, snippet: sub.summary.slice(0, 150) })
          break
        }
      }
    }
  }

  if (conflictHits.length > 0) {
    console.log(`  ⚠️  Conflict acknowledgements found: ${conflictHits.length}`)
    for (const h of conflictHits) {
      console.log(`     • ${h.topic}: "${h.snippet}"`)
    }
  } else {
    console.log(`  ℹ️  No explicit conflict acknowledgements detected`)
    console.log(`     (Check the full output to see if sources were merged or concatenated)`)
  }

  // Save full output for inspection
  const outPath = path.join(__dirname, 'test-output.json')
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2))
  console.log(`\n  Full output saved to: ${outPath}\n`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
