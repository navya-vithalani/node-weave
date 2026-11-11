import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatResponse, Chunk, ChunkStore, OriginalStructure } from '../types/schema';
import { getTopicInsights } from '../lib/graphIds';
import { embedText } from '../lib/embeddings';
import { retrieveTopK } from '../lib/retrieval';

interface ChatPanelProps {
  structure: OriginalStructure;
  chunkStore: ChunkStore;
  onAddInsight: (text: string, sourceIds: string[]) => void;
  onSelectSource: (sourceId: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourceIds?: string[];
  chunkIds?: string[];
  asciiDrawing?: string | null;
  insightText?: string | null;
  insightHandled?: boolean;
  lookupMode?: boolean;
  showVerificationWarning?: boolean;
  warning?: string;
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}

function lexicalChunkSearch(query: string, chunks: Chunk[], limit = 5): Chunk[] {
  const terms = new Set(tokenize(query));
  if (!terms.size) return [];
  return chunks
    .map((chunk) => {
      const text = chunk.text.toLocaleLowerCase();
      const score = [...terms].reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

function buildRelevantJsonSlice(structure: OriginalStructure, query: string): string {
  const terms = new Set(tokenize(query));
  const rankedTopics = structure.topics.map((topic) => {
    const topicText = `${topic.name} ${topic.summary}`;
    const topicScore = tokenize(topicText).filter((term) => terms.has(term)).length;
    const rankedSubtopics = topic.subtopics.map((subtopic) => ({
      subtopic,
      score: tokenize(`${subtopic.name} ${subtopic.summary} ${subtopic.points.join(' ')}`)
        .filter((term) => terms.has(term)).length,
    })).sort((a, b) => b.score - a.score);
    return { topic, topicScore, rankedSubtopics };
  });
  const selectedTopics = rankedTopics
    .filter(({ topicScore, rankedSubtopics }) => topicScore > 0 || rankedSubtopics.some(({ score }) => score > 0))
    .sort((a, b) => b.topicScore + (b.rankedSubtopics[0]?.score ?? 0) - (a.topicScore + (a.rankedSubtopics[0]?.score ?? 0)))
    .slice(0, 3);

  const includedNodeIds = new Set<string>();
  const topics = selectedTopics.map(({ topic, topicScore, rankedSubtopics }) => {
    includedNodeIds.add(topic.id);
    const selectedSubtopics = topicScore > 0
      ? topic.subtopics
      : rankedSubtopics.filter(({ score }) => score > 0).slice(0, 5).map(({ subtopic }) => subtopic);
    selectedSubtopics.forEach((subtopic) => includedNodeIds.add(subtopic.id));
    const insights = getTopicInsights(structure, topic).filter((insight) =>
      insight.anchorTopicId === topic.id || includedNodeIds.has(insight.anchorTopicId)
    );
    insights.forEach((insight) => includedNodeIds.add(insight.id));
    return { ...topic, subtopics: selectedSubtopics, customInsights: insights };
  });

  return JSON.stringify({
    topics,
    customInsights: selectedTopics.flatMap(({ topic }) =>
      getTopicInsights(structure, topic).filter((insight) => includedNodeIds.has(insight.id))
    ),
    connections: structure.connections.filter((connection) =>
      includedNodeIds.has(connection.source) && includedNodeIds.has(connection.target)
    ),
  });
}

function findSourceLabel(structure: OriginalStructure, sourceId: string): string {
  for (const topic of structure.topics) {
    if (topic.id === sourceId) return topic.name;
    const subtopic = topic.subtopics.find((item) => item.id === sourceId);
    if (subtopic) return subtopic.name;
    const insight = getTopicInsights(structure, topic).find((item) => item.id === sourceId);
    if (insight) return insight.name;
  }
  return sourceId;
}

function getLocalAnswer(query: string, chunks: Chunk[]): { answer: string; chunkIds: string[] } {
  const matches = lexicalChunkSearch(query, chunks, 3);
  if (!matches.length) {
    return {
      answer: "I couldn't reach the AI just now, and I couldn't find a close local match. Try another wording when the connection is back.",
      chunkIds: [],
    };
  }
  return {
    answer: `I couldn't reach the AI, so here's a local lookup rather than a generated answer:\n\n${matches
      .map((chunk) => chunk.text)
      .join('\n\n---\n\n')}`,
    chunkIds: matches.map((chunk) => chunk.id),
  };
}

function makeMessage(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: crypto.randomUUID(), role, content, ...extra };
}

export default function ChatPanel({ structure, chunkStore, onAddInsight, onSelectSource }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    makeMessage('assistant', 'I’m Miso, your curious map-cat. Ask me about a chapter, follow a connection, or ask for a little diagram.'),
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sourceNodes = useMemo(() => new Map(
    structure.topics.flatMap((topic) => [
      [topic.id, topic.name] as const,
      ...topic.subtopics.map((subtopic) => [subtopic.id, subtopic.name] as const),
      ...getTopicInsights(structure, topic).map((insight) => [insight.id, insight.name] as const),
    ])
  ), [structure]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = input.trim();
    if (!query || sending) return;

    const userMessage = makeMessage('user', query);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setError('');
    setSending(true);

    let retrievedChunks: Chunk[] = [];
    let retrievalWarning = '';
    const embeddedChunks = chunkStore.chunks.filter((chunk) => chunk.embedding.length > 0);
    if (embeddedChunks.length) {
      try {
        const embedding = await embedText(query);
        retrievedChunks = retrieveTopK(Array.from(embedding), embeddedChunks, 5).map(({ chunk }) => chunk);
      } catch (retrievalError) {
        retrievedChunks = lexicalChunkSearch(query, chunkStore.chunks);
        retrievalWarning = retrievalError instanceof Error
          ? `Semantic search was unavailable; using local keyword matches instead. ${retrievalError.message}`
          : 'Semantic search was unavailable; using local keyword matches instead.';
      }
    } else {
      retrievedChunks = lexicalChunkSearch(query, chunkStore.chunks);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          retrievedChunks: retrievedChunks.map(({ id, text }) => ({ id, text })),
          relevantJsonSlice: buildRelevantJsonSlice(structure, query),
          chatHistory: history.slice(-20),
        }),
      });
      const responseText = await response.text();
      let payload: Partial<ChatResponse> & { error?: string; detail?: string };
      try {
        payload = JSON.parse(responseText) as Partial<ChatResponse> & { error?: string; detail?: string };
      } catch {
        throw new Error(responseText || `Chat request failed (${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `Chat request failed (${response.status}).`);
      }
      if (typeof payload.answer !== 'string') {
        throw new Error('The chat service returned an invalid answer.');
      }
      setMessages((previous) => [...previous, makeMessage('assistant', payload.answer!, {
        sourceIds: Array.isArray(payload.sourceIds) ? payload.sourceIds.filter((id): id is string => typeof id === 'string') : [],
        asciiDrawing: typeof payload.asciiDrawing === 'string' ? payload.asciiDrawing : null,
        insightText: typeof payload.insightText === 'string' ? payload.insightText : null,
        showVerificationWarning: true,
        warning: retrievalWarning,
      })]);
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : 'The chat service is unavailable.';
      setError(message);
      const fallback = getLocalAnswer(query, retrievedChunks);
      setMessages((previous) => [...previous, makeMessage('assistant', fallback.answer, {
        chunkIds: fallback.chunkIds,
        lookupMode: true,
        warning: retrievalWarning,
      })]);
    } finally {
      setSending(false);
    }
  };

  const handleInsight = (message: ChatMessage, accept: boolean) => {
    if (accept && message.insightText) onAddInsight(message.insightText, message.sourceIds ?? []);
    setMessages((previous) => previous.map((item) =>
      item.id === message.id ? { ...item, insightHandled: true } : item
    ));
  };

  return (
    <section className="cat-chat" aria-label="Chat with Miso">
      <header className="cat-chat__header">
        <div className="cat-chat__identity">
          <pre className="cat-chat__mascot" aria-hidden="true">{'/ᐠ｡ꞈ｡ᐟ\\'}</pre>
          <div>
            <span className="terminal-label">YOUR MAP-CAT</span>
            <h2>Miso <span>is listening</span></h2>
          </div>
        </div>
        <span className={`cat-chat__signal ${sending ? 'cat-chat__signal--thinking' : ''}`} aria-label={sending ? 'Thinking' : 'Ready'}>
          {sending ? '● thinking' : '● ready'}
        </span>
      </header>

      <div className="cat-chat__feed" aria-live="polite">
        {messages.map((message, index) => (
          <article
            key={message.id}
            className={`cat-chat__message cat-chat__message--${message.role} ${message.role === 'assistant' && index % 2 ? 'cat-chat__message--offset' : ''}`}
          >
            {message.role === 'assistant' && <span className="cat-chat__message-cat" aria-hidden="true">ᓚᘏᗢ</span>}
            <div className="cat-chat__message-body">
              <span className="cat-chat__message-label">
                {message.role === 'user' ? 'YOU' : message.lookupMode ? 'LOCAL PAW-SEARCH' : 'MISO’S FIELD NOTE'}
              </span>
              <p className="cat-chat__answer">{message.content}</p>
              {message.warning && <p className="cat-chat__notice">{message.warning}</p>}
              {message.lookupMode && <p className="cat-chat__lookup-note">Lookup mode · matching text only, not an AI-generated answer.</p>}

              {message.sourceIds && message.sourceIds.length > 0 && (
                <div className="cat-chat__sources" aria-label="Answer sources">
                  {message.sourceIds.map((sourceId) => (
                    <button
                      type="button"
                      key={sourceId}
                      className="cat-chat__source"
                      onClick={() => onSelectSource(sourceId)}
                    >
                      ↗ {sourceNodes.get(sourceId) ?? findSourceLabel(structure, sourceId)}
                    </button>
                  ))}
                </div>
              )}
              {message.chunkIds && message.chunkIds.length > 0 && (
                <div className="cat-chat__sources" aria-label="Matching source material">
                  {message.chunkIds.map((chunkId) => {
                    const chunk = chunkStore.chunks.find((item) => item.id === chunkId);
                    return <span className="cat-chat__source cat-chat__source--static" key={chunkId}>▤ {chunk?.docId ?? 'source note'}</span>;
                  })}
                </div>
              )}
              {message.asciiDrawing && (
                <figure className="cat-chat__drawing">
                  <figcaption>✦ MISO DREW THIS FOR YOU</figcaption>
                  <pre>{message.asciiDrawing}</pre>
                </figure>
              )}
              {message.insightText && !message.insightHandled && (
                <div className="cat-chat__insight">
                  <span>✦ A thought worth keeping</span>
                  <p>{message.insightText}</p>
                  <div>
                    <button type="button" onClick={() => handleInsight(message, true)}>Pin to map</button>
                    <button type="button" onClick={() => handleInsight(message, false)}>Let it go</button>
                  </div>
                </div>
              )}
              {message.role === 'assistant' && !message.lookupMode && (
                <>
                  {message.showVerificationWarning && (!message.sourceIds || message.sourceIds.length === 0) && (
                    <p className="cat-chat__unverified">⚠ Miso couldn’t verify this against a source node.</p>
                  )}
                  <p className="cat-chat__disclaimer">Miso only uses this map and its uploaded source notes.</p>
                </>
              )}
            </div>
          </article>
        ))}
        {sending && (
          <div className="cat-chat__thinking" role="status">
            <span aria-hidden="true">ᓚᘏᗢ</span>
            <span>Miso is sniffing through the notes…</span>
            <i />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="cat-chat__error" role="alert">The model didn’t answer: {error}</div>}
      {chunkStore.chunks.length === 0 && (
        <div className="cat-chat__memory-note">No source notes are bundled in this session. Miso can still use the knowledge map.</div>
      )}
      {chunkStore.chunks.length > 0 && !chunkStore.chunks.some((chunk) => chunk.embedding.length > 0) && (
        <div className="cat-chat__memory-note">Semantic memory is unavailable. Miso is searching the saved source notes by keyword.</div>
      )}
      <form className="cat-chat__composer" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor="cat-chat-input">Ask Miso about your map</label>
        <textarea
          id="cat-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask the map-cat something…"
          rows={2}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()} aria-label="Send question">
          {sending ? '…' : '↗'}
        </button>
        <span>ENTER to send · SHIFT + ENTER for a new line</span>
      </form>
    </section>
  );
}
