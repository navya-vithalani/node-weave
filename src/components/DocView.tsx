import { useMemo } from 'react';
import type { OriginalStructure } from '../types/schema';
import { getTopicInsights } from '../lib/graphIds';

interface DocViewProps {
  structure: OriginalStructure;
  showSubtopics: boolean;
  showConnections: boolean;
  searchTerm: string;
  collapsibleSections: boolean;
}

function HighlightedText({ value, searchTerm }: { value: string; searchTerm: string }) {
  if (!searchTerm.trim()) return <>{value}</>;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pieces = value.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {pieces.map((piece, index) => piece.toLocaleLowerCase() === searchTerm.toLocaleLowerCase()
        ? <mark key={index}>{piece}</mark>
        : <span key={index}>{piece}</span>)}
    </>
  );
}

function renderSubtopic(
  subtopic: OriginalStructure['topics'][number]['subtopics'][number],
  index: number,
  collapsibleSections: boolean,
  searchTerm: string,
) {
  const content = (
    <>
      <p className="doc-book__section-summary"><HighlightedText value={subtopic.summary} searchTerm={searchTerm} /></p>
      {subtopic.points.length > 0 && (
        <ul className="doc-book__points">
          {subtopic.points.map((point, pointIndex) => (
            <li key={`${subtopic.id}-point-${pointIndex}`}><HighlightedText value={point} searchTerm={searchTerm} /></li>
          ))}
        </ul>
      )}
      {subtopic.discrepancy && (
        <aside className="doc-book__discrepancy">
          <strong>Source difference</strong>
          <p><HighlightedText value={subtopic.discrepancy} searchTerm={searchTerm} /></p>
        </aside>
      )}
    </>
  );

  return (
    <section className="doc-book__section" key={subtopic.id}>
      {collapsibleSections ? (
        <details className="doc-book__fold" open>
          <summary><span className="doc-book__section-number">{index + 1}.</span><h3><HighlightedText value={subtopic.name} searchTerm={searchTerm} /></h3></summary>
          {content}
        </details>
      ) : (
        <>
          <h3><span className="doc-book__section-number">{index + 1}.</span><HighlightedText value={subtopic.name} searchTerm={searchTerm} /></h3>
          {content}
        </>
      )}
    </section>
  );
}

export default function DocView({
  structure,
  showSubtopics,
  showConnections,
  searchTerm,
  collapsibleSections,
}: DocViewProps) {
  const insightsByTopic = useMemo(() => new Map(
    structure.topics.map((topic) => [topic.id, getTopicInsights(structure, topic)])
  ), [structure]);
  const displayText = useMemo(() => JSON.stringify({
    topics: structure.topics.map((topic) => ({
      name: topic.name,
      summary: topic.summary,
      subtopics: showSubtopics ? topic.subtopics : [],
      insights: insightsByTopic.get(topic.id) ?? [],
    })),
    connections: showConnections ? structure.connections : [],
  }).toLocaleLowerCase(), [insightsByTopic, showConnections, showSubtopics, structure]);
  const hasMatches = !searchTerm.trim() || displayText.includes(searchTerm.toLocaleLowerCase());
  const nodeNames = useMemo(() => new Map(
    structure.topics.flatMap((topic) => [
      [topic.id, topic.name] as const,
      ...topic.subtopics.map((subtopic) => [subtopic.id, subtopic.name] as const),
      ...(insightsByTopic.get(topic.id) ?? []).map((insight) => [insight.id, insight.name] as const),
    ])
  ), [insightsByTopic, structure]);

  return (
    <section className="doc-view" aria-label="Formatted study document">
      <div className="doc-view__scroll">
        <article className="doc-book">
          <header className="doc-book__cover">
            <span className="doc-book__eyebrow">FIELD GUIDE <i>✦</i> {structure.topics.length} CHAPTERS</span>
            <h1>Study notes</h1>
            <p>A living reader made from your map. Follow the chapters, keep the useful details, and let the connections tie it together.</p>
            <div className="doc-book__ornament" aria-hidden="true">⌁ ───────── ✦ ───────── ⌁</div>
          </header>

          {structure.topics.map((topic, topicIndex) => {
            const insights = insightsByTopic.get(topic.id) ?? [];
            return (
              <article className="doc-book__chapter" key={topic.id}>
                <div className="doc-book__chapter-label">CHAPTER {String(topicIndex + 1).padStart(2, '0')}</div>
                <h2><HighlightedText value={topic.name} searchTerm={searchTerm} /></h2>
                <p className="doc-book__chapter-summary"><HighlightedText value={topic.summary} searchTerm={searchTerm} /></p>

                {showSubtopics && topic.subtopics.map((subtopic, subtopicIndex) =>
                  renderSubtopic(subtopic, subtopicIndex, collapsibleSections, searchTerm)
                )}

                {insights.length > 0 && (
                  <div className="doc-book__insights">
                    {insights.map((insight) => {
                      const anchor = topic.subtopics.find((subtopic) => subtopic.id === insight.anchorTopicId);
                      return (
                        <aside className="doc-book__insight" key={insight.id}>
                          <span>✦ A NOTE YOU KEPT{anchor ? ` · ${anchor.name}` : ''}</span>
                          <h3><HighlightedText value={insight.name} searchTerm={searchTerm} /></h3>
                          <p><HighlightedText value={insight.summary} searchTerm={searchTerm} /></p>
                        </aside>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}

          {showConnections && structure.connections.length > 0 && (
            <section className="doc-book__connections">
              <div className="doc-book__chapter-label">THREADS BETWEEN CHAPTERS</div>
              <h2>Where ideas meet</h2>
              <ol>
                {structure.connections.map((connection) => (
                  <li key={connection.id}>
                    <p className="doc-book__connection-nodes">
                      <HighlightedText value={nodeNames.get(connection.source) ?? connection.source} searchTerm={searchTerm} />
                      <span> ↔ </span>
                      <HighlightedText value={nodeNames.get(connection.target) ?? connection.target} searchTerm={searchTerm} />
                    </p>
                    <p><HighlightedText value={connection.link} searchTerm={searchTerm} /></p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!hasMatches && <p className="doc-book__empty">No matching passages in these notes.</p>}
          <footer className="doc-book__footer">End of this reading · return to the map whenever you want to explore.</footer>
        </article>
      </div>
    </section>
  );
}
