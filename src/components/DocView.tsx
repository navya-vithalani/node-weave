import { useMemo } from 'react';
import type { OriginalStructure } from '../types/schema';

interface DocViewProps {
  structure: OriginalStructure;
  showSubtopics: boolean;
  showConnections: boolean;
  searchTerm: string;
  collapsibleSections: boolean;
}

function containsSearch(value: unknown, searchTerm: string): boolean {
  return !searchTerm || JSON.stringify(value).toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase());
}

function HighlightedText({ value, searchTerm }: { value: string; searchTerm: string }) {
  if (!searchTerm) return <>{value}</>;
  const index = value.toLocaleLowerCase().indexOf(searchTerm.toLocaleLowerCase());
  if (index < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, index)}
      <mark>{value.slice(index, index + searchTerm.length)}</mark>
      {value.slice(index + searchTerm.length)}
    </>
  );
}

function JsonValue({
  name,
  value,
  depth,
  searchTerm,
  collapsibleSections,
}: {
  name?: string;
  value: unknown;
  depth: number;
  searchTerm: string;
  collapsibleSections: boolean;
}) {
  const key = name === undefined ? null : (
    <span className="doc-view__key">"{name}"</span>
  );

  if (value === null || typeof value !== 'object') {
    let className = 'doc-view__string';
    let renderedValue = JSON.stringify(value);
    if (typeof value === 'number') className = 'doc-view__number';
    else if (typeof value === 'boolean') className = 'doc-view__boolean';
    else if (value === null) className = 'doc-view__null';

    return (
      <div className="doc-view__primitive">
        {key && <>{key}<span className="doc-view__punctuation">: </span></>}
        <span className={className}>
          <HighlightedText value={renderedValue} searchTerm={searchTerm} />
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  const isArray = Array.isArray(value);
  const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  const expanded = searchTerm
    ? containsSearch(value, searchTerm)
    : !collapsibleSections || depth === 0;
  const body = (
    <div className="doc-view__children">
      {entries.map(([entryName, entryValue]) => (
        <JsonValue
          key={entryName}
          name={isArray ? undefined : entryName}
          value={entryValue}
          depth={depth + 1}
          searchTerm={searchTerm}
          collapsibleSections={collapsibleSections}
        />
      ))}
    </div>
  );

  return (
    <details className="doc-view__branch" open={expanded}>
      <summary>
        {key && <>{key}<span className="doc-view__punctuation">: </span></>}
        <span className="doc-view__shape">{summary}</span>
      </summary>
      {body}
    </details>
  );
}

export default function DocView({
  structure,
  showSubtopics,
  showConnections,
  searchTerm,
  collapsibleSections,
}: DocViewProps) {
  const displayStructure = useMemo<OriginalStructure>(() => ({
    ...structure,
    topics: showSubtopics
      ? structure.topics
      : structure.topics.map((topic) => ({ ...topic, subtopics: [] })),
    connections: showConnections ? structure.connections : [],
  }), [showConnections, showSubtopics, structure]);

  return (
    <section className="doc-view" aria-label="Formatted session document">
      <header className="doc-view__header">
        <div>
          <span className="terminal-label">DOCUMENT</span>
          <h2>{structure.sessionName}</h2>
        </div>
        <span className="doc-view__meta">
          {displayStructure.topics.length} topics · {displayStructure.connections.length} connections
        </span>
      </header>
      <div className="doc-view__content">
        <JsonValue
          value={displayStructure}
          depth={0}
          searchTerm={searchTerm}
          collapsibleSections={collapsibleSections}
        />
        {searchTerm && !containsSearch(displayStructure, searchTerm) && (
          <p className="doc-view__empty">No matching text in this document.</p>
        )}
      </div>
    </section>
  );
}
