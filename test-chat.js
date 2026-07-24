/**
 * Test runner for /api/chat
 *
 * Tests two scenarios against the deployed chat endpoint:
 *   1. A query COVERED by the uploaded material — expects sourceIds and a real answer
 *   2. A query NOT covered — expects the exact refusal string
 *
 * Usage:
 *   node test-chat.js <url> <structure-json-path>
 *
 *   url                — deployed /api/chat endpoint
 *   structure-json-    — path to the test-output.json from the structure test
 *   path
 *
 * Example:
 *   node test-chat.js https://nodeweave-app.vercel.app/api/chat ./test-output.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_URL = process.argv[2]
const STRUCTURE_PATH = process.argv[3]

if (!API_URL || !STRUCTURE_PATH) {
  console.error('Usage: node test-chat.js <url> <structure-json-path>')
  console.error('  url       — deployed /api/chat endpoint')
  console.error('  structure — path to the test-output.json from the structure test')
  process.exit(1)
}

// Read the test documents and structure output
function loadTestDocs() {
  const testDataDir = path.join(__dirname, 'test-data')
  const files = fs.readdirSync(testDataDir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    .sort()
  return files.map(f => ({
    id: f.replace(/\.(md|txt)$/, ''),
    text: fs.readFileSync(path.join(testDataDir, f), 'utf-8'),
  }))
}

const structure = JSON.parse(fs.readFileSync(STRUCTURE_PATH, 'utf-8'))
const docs = loadTestDocs()

const COVERED_QUERY = 'What is Coulomb\'s law and how does it compare to gravity?'
const UNCOVERED_QUERY = 'What is the theory of relativity?'

// Use the full source docs as retrieved chunks (simulating the retrieval pipeline)
const retrievedChunks = docs.map(d => ({ id: d.id, text: d.text }))
const relevantJsonSlice = JSON.stringify(structure)

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

function pass(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`) }

async function testChat(query, label, expectations) {
  console.log(`\n  ── ${label}`)
  console.log(`  Query: "${query.slice(0, 80)}..."`)

  const start = Date.now()
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      retrievedChunks,
      relevantJsonSlice,
      chatHistory: [],
    }),
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  if (!res.ok) {
    const text = await res.text()
    console.log(`  ${RED}HTTP ${res.status} after ${elapsed}s${RESET}`)
    console.log(`  ${text.slice(0, 500)}`)
    return null
  }

  const data = await res.json()
  console.log(`  ${GREEN}${res.status}${RESET} in ${elapsed}s`)
  console.log(`  Answer: ${data.answer?.slice(0, 200)}${data.answer?.length > 200 ? '…' : ''}`)

  if (data.sourceIds?.length) {
    pass(`sourceIds: ${data.sourceIds.join(', ')}`)
  } else {
    fail('sourceIds: empty (no grounding)')
  }

  // Check expectations
  for (const [key, fn] of Object.entries(expectations)) {
    try {
      fn(data)
      pass(key)
    } catch (e) {
      fail(`${key} — ${e.message}`)
    }
  }

  return data
}

async function main() {
  console.log(`\n  ╔══════════════════════════════════════════╗`)
  console.log(`  ║      NodeWeave — Chat Test Runner        ║`)
  console.log(`  ╚══════════════════════════════════════════╝\n`)
  console.log(`  Endpoint: ${API_URL}`)
  console.log(`  Structure: ${STRUCTURE_PATH.split(/[/\\]/).pop()}`)
  console.log(`  Source docs: ${docs.map(d => d.id).join(', ')}`)

  // Test 1: Covered query
  const result1 = await testChat(COVERED_QUERY, 'COVERED QUERY', {
    'has answer text': (d) => {
      if (!d.answer || d.answer.length < 10) throw new Error('Answer too short or missing')
    },
    'has sourceIds': (d) => {
      if (!d.sourceIds || d.sourceIds.length === 0) throw new Error('sourceIds is empty')
    },
    'isInsightWorthy is boolean': (d) => {
      if (typeof d.isInsightWorthy !== 'boolean') throw new Error(`Got ${typeof d.isInsightWorthy}`)
    },
    'correction has correct shape': (d) => {
      if (!d.correction || typeof d.correction !== 'object') throw new Error('correction missing')
    },
    'asciiDrawing is null or string': (d) => {
      if (d.asciiDrawing !== null && typeof d.asciiDrawing !== 'string') throw new Error(`Got ${typeof d.asciiDrawing}`)
    },
  })

  // Test 2: Uncovered query
  const result2 = await testChat(UNCOVERED_QUERY, 'UNCOVERED QUERY', {
    'returns exact refusal string': (d) => {
      const expected = "This isn't covered in your uploaded material."
      if (d.answer !== expected) throw new Error(`Expected exact refusal, got: "${d.answer?.slice(0, 100)}"`)
    },
    'sourceIds is empty': (d) => {
      if (d.sourceIds && d.sourceIds.length > 0) throw new Error(`sourceIds should be empty but has: ${d.sourceIds.join(',')}`)
    },
    'correctionFlag is false': (d) => {
      if (d.correctionFlag !== false) throw new Error('correctionFlag should be false for uncovered query')
    },
  })

  // Results summary
  const allTests = [result1, result2]
  const successCount = allTests.filter(Boolean).length
  const failCount = allTests.filter(r => r === null).length

  console.log(`\n  ${'═'.repeat(46)}`)
  if (failCount === 0) {
    console.log(`  ${GREEN}All chat endpoint checks passed${RESET}`)
    console.log(`  \n  Note: Confirm single-call behavior in the browser network tab`)
    console.log(`  when the frontend is wired up (Step 6).`)
  } else {
    console.log(`  ${RED}${failCount} test(s) failed — check output above${RESET}`)
  }
  console.log()
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})