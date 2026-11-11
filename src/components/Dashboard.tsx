import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { OriginalStructure, CustomInsight } from '../types/schema';
import PhysicsGraph, { type GraphNode } from './PhysicsGraph';
import TreeView, { type TreeLayout } from './TreeView';
import DocView from './DocView';
import '../styles/dashboard.css';

interface DashboardProps {
  sessionName: string;
  structure: OriginalStructure;
  customInsights?: CustomInsight[];
}

type ViewMode = 'graph' | 'tree' | 'doc';

function getSearchableNodes(structure: OriginalStructure): GraphNode[] {
  return structure.topics.flatMap((topic, topicIndex) => {
    const topicId = `topic-${topicIndex}`;
    const topicNode: GraphNode = {
      id: topicId,
      type: 'topic',
      name: topic.name,
      summary: topic.summary,
    };
    const subtopicNodes: GraphNode[] = topic.subtopics.map((subtopic, subIndex) => ({
      id: `subtopic-${topicIndex}-${subIndex}`,
      type: 'subtopic',
      name: subtopic.name,
      summary: subtopic.summary,
      points: subtopic.points,
      parentTopicId: topicId,
    }));
    const insightNodes: GraphNode[] = (topic.customInsights ?? []).map((insight) => ({
      id: `insight-${topicIndex}-${insight.id}`,
      type: 'customInsight',
      name: insight.name,
      summary: insight.summary,
      parentTopicId: topicId,
    }));
    return [topicNode, ...subtopicNodes, ...insightNodes];
  });
}

export default function Dashboard(props: DashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
  const [showSubtopics, setShowSubtopics] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [nodeSearch, setNodeSearch] = useState('');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [dimUnrelated, setDimUnrelated] = useState(false);
  const [physicsPaused, setPhysicsPaused] = useState(false);
  const [reheatRequest, setReheatRequest] = useState(0);
  const [nodeScale, setNodeScale] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [treeLayout, setTreeLayout] = useState<TreeLayout>('left-right');
  const [expandedTopics, setExpandedTopics] = useState(
    () => new Set(props.structure.topics.map((_, index) => `topic-${index}`))
  );
  const [focusedBranchId, setFocusedBranchId] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [collapsibleSections, setCollapsibleSections] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Ask me anything about your knowledge graph.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const searchableNodes = useMemo(() => getSearchableNodes(props.structure), [props.structure]);
  const searchMatches = useMemo(() => {
    const query = nodeSearch.trim().toLocaleLowerCase();
    return query
      ? searchableNodes.filter((node) => node.name.toLocaleLowerCase().includes(query)).slice(0, 8)
      : [];
  }, [nodeSearch, searchableNodes]);

  useEffect(() => {
    setExpandedTopics(new Set(props.structure.topics.map((_, index) => `topic-${index}`)));
    setFocusNodeId(null);
    setFocusedBranchId('');
    setNodeSearch('');
    setDocSearch('');
  }, [props.structure]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages((previous) => [...previous, { role: 'user', content: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setChatMessages((previous) => [...previous, { role: 'assistant', content: 'Based on your knowledge graph...' }]);
    }, 1000);
  };

  const handleChatToggle = () => {
    if (detailNode) {
      setDetailNode(null);
      setSidePanelOpen(true);
      return;
    }
    setSidePanelOpen((open) => !open);
  };

  const handleNodeDetail = useCallback((node: GraphNode) => {
    setDetailNode(node);
    setSidePanelOpen(true);
  }, []);

  const handleSelectSearchResult = useCallback((node: GraphNode) => {
    setNodeSearch(node.name);
    setFocusNodeId(node.id);
    setFocusedBranchId('');
    const parentTopicId = node.parentTopicId;
    if (node.type === 'subtopic' && parentTopicId) {
      setShowSubtopics(true);
      setExpandedTopics((previous) => new Set(previous).add(parentTopicId));
    }
    if (viewMode === 'doc') setDocSearch(node.name);
  }, [viewMode]);

  const handleToggleTreeTopic = useCallback((topicId: string) => {
    setExpandedTopics((previous) => {
      const next = new Set(previous);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }, []);

  const handleToggleAllTreeTopics = () => {
    const allExpanded = props.structure.topics.every((_, index) => expandedTopics.has(`topic-${index}`));
    setExpandedTopics(allExpanded
      ? new Set()
      : new Set(props.structure.topics.map((_, index) => `topic-${index}`)));
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchMatches[0]) {
      event.preventDefault();
      handleSelectSearchResult(searchMatches[0]);
    }
  };

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <span className="terminal-label">SESSION</span>
          <h1 className="dashboard__title">{props.sessionName}</h1>
        </div>
        <div className="dashboard__header-center">
          <button
            type="button"
            className={`dashboard__mode-btn dashboard__chat-toggle ${sidePanelOpen ? 'dashboard__mode-btn--active' : ''}`}
            onClick={handleChatToggle}
            aria-pressed={sidePanelOpen && !detailNode}
          >
            Chat
          </button>
        </div>
      </header>

      <div className={`dashboard__content ${controlsOpen ? '' : 'dashboard__content--controls-collapsed'} ${sidePanelOpen ? '' : 'dashboard__content--chat-closed'}`}>
        <aside className={`dashboard__controls-panel ${controlsOpen ? '' : 'dashboard__controls-panel--collapsed'}`}>
          <button
            type="button"
            className="controls-panel__collapse"
            onClick={() => setControlsOpen((open) => !open)}
            aria-label={controlsOpen ? 'Collapse controls panel' : 'Expand controls panel'}
            aria-expanded={controlsOpen}
          >
            {controlsOpen ? '‹' : '☷'}
          </button>

          {controlsOpen && (
            <div className="controls-panel__body">
              <div className="controls-panel__title">
                <span className="terminal-label">EXPLORE</span>
                <strong>View & controls</strong>
              </div>

              <section className="controls-panel__section">
                <h2>View</h2>
                <div className="controls-panel__view-options" role="group" aria-label="Select view">
                  {(['graph', 'tree', 'doc'] as const).map((view) => (
                    <button
                      type="button"
                      key={view}
                      className={`controls-panel__view-btn ${viewMode === view ? 'controls-panel__view-btn--active' : ''}`}
                      onClick={() => setViewMode(view)}
                      aria-pressed={viewMode === view}
                    >
                      {view === 'doc' ? 'Doc' : view[0].toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="controls-panel__section">
                <h2>All views</h2>
                <label className="controls-panel__check">
                  <input type="checkbox" checked={showSubtopics} onChange={(event) => setShowSubtopics(event.target.checked)} />
                  <span>Show subtopics</span>
                </label>
                <label className="controls-panel__check">
                  <input type="checkbox" checked={showConnections} onChange={(event) => setShowConnections(event.target.checked)} />
                  <span>Show cross-topic connections</span>
                </label>
                <div className="controls-panel__field">
                  <label htmlFor="node-search">Find a node</label>
                  <input
                    id="node-search"
                    type="search"
                    value={nodeSearch}
                    onChange={(event) => {
                      setNodeSearch(event.target.value);
                      setFocusNodeId(null);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search topics..."
                  />
                  {searchMatches.length > 0 && !focusNodeId && (
                    <div className="controls-panel__search-results" role="listbox" aria-label="Matching nodes">
                      {searchMatches.map((node) => (
                        <button
                          type="button"
                          role="option"
                          key={node.id}
                          onClick={() => handleSelectSearchResult(node)}
                        >
                          <span>{node.name}</span>
                          <small>{node.type}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {focusNodeId && (
                    <button type="button" className="controls-panel__text-btn" onClick={() => {
                      setFocusNodeId(null);
                      setNodeSearch('');
                    }}>
                      Clear focus
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="controls-panel__button"
                  onClick={() => setFitRequest((request) => request + 1)}
                  disabled={viewMode === 'doc'}
                >
                  Fit / reset view
                </button>
              </section>

              {viewMode === 'graph' && (
                <section className="controls-panel__section">
                  <h2>Graph</h2>
                  <label className="controls-panel__check">
                    <input type="checkbox" checked={dimUnrelated} onChange={(event) => setDimUnrelated(event.target.checked)} />
                    <span>Focus node; dim unrelated</span>
                  </label>
                  <div className="controls-panel__button-row">
                    <button type="button" className="controls-panel__button" onClick={() => setPhysicsPaused((paused) => !paused)}>
                      {physicsPaused ? 'Resume physics' : 'Pause physics'}
                    </button>
                    <button type="button" className="controls-panel__button" onClick={() => setReheatRequest((request) => request + 1)} disabled={physicsPaused}>
                      Reheat
                    </button>
                  </div>
                  <div className="controls-panel__field">
                    <label htmlFor="node-size">Node size</label>
                    <select id="node-size" value={nodeScale} onChange={(event) => setNodeScale(Number(event.target.value))}>
                      <option value={0.8}>Small</option>
                      <option value={1}>Default</option>
                      <option value={1.3}>Large</option>
                    </select>
                  </div>
                </section>
              )}

              {viewMode === 'tree' && (
                <section className="controls-panel__section">
                  <h2>Tree</h2>
                  <div className="controls-panel__field">
                    <label htmlFor="tree-layout">Layout</label>
                    <select id="tree-layout" value={treeLayout} onChange={(event) => setTreeLayout(event.target.value as TreeLayout)}>
                      <option value="left-right">Root left → branches right</option>
                      <option value="top-down">Root top → branches down</option>
                      <option value="radial">Radial around root</option>
                    </select>
                  </div>
                  <button type="button" className="controls-panel__button" onClick={handleToggleAllTreeTopics}>
                    {props.structure.topics.every((_, index) => expandedTopics.has(`topic-${index}`)) ? 'Collapse all branches' : 'Expand all branches'}
                  </button>
                  <div className="controls-panel__field">
                    <label htmlFor="tree-focus">Focus a branch</label>
                    <select id="tree-focus" value={focusedBranchId} onChange={(event) => setFocusedBranchId(event.target.value)}>
                      <option value="">All topics</option>
                      {props.structure.topics.map((topic, index) => (
                        <option key={topic.id} value={`topic-${index}`}>{topic.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="controls-panel__hint">Use About and Points on each card to expand details.</p>
                </section>
              )}

              {viewMode === 'doc' && (
                <section className="controls-panel__section">
                  <h2>Document</h2>
                  <label className="controls-panel__check">
                    <input type="checkbox" checked={collapsibleSections} onChange={(event) => setCollapsibleSections(event.target.checked)} />
                    <span>Collapsible JSON sections</span>
                  </label>
                  <div className="controls-panel__field">
                    <label htmlFor="doc-search">Search within JSON</label>
                    <input
                      id="doc-search"
                      type="search"
                      value={docSearch}
                      onChange={(event) => setDocSearch(event.target.value)}
                      placeholder="Search document..."
                    />
                  </div>
                </section>
              )}
            </div>
          )}
        </aside>

        <section className="dashboard__view" aria-label={`${viewMode} view`}>
          {viewMode === 'graph' && (
            <PhysicsGraph
              structure={props.structure}
              onNodeDetail={handleNodeDetail}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              fitRequest={fitRequest}
              focusNodeId={focusNodeId}
              dimUnrelated={dimUnrelated}
              physicsPaused={physicsPaused}
              reheatRequest={reheatRequest}
              nodeScale={nodeScale}
            />
          )}
          {viewMode === 'tree' && (
            <TreeView
              structure={props.structure}
              layout={treeLayout}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              expandedTopics={expandedTopics}
              onToggleTopic={handleToggleTreeTopic}
              focusedBranchId={focusedBranchId || null}
              focusNodeId={focusNodeId}
              fitRequest={fitRequest}
              onNodeDetail={handleNodeDetail}
            />
          )}
          {viewMode === 'doc' && (
            <DocView
              structure={props.structure}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              searchTerm={docSearch}
              collapsibleSections={collapsibleSections}
            />
          )}
        </section>

        {sidePanelOpen && (
          <aside className={`dashboard__side-panel panel ${detailNode ? 'dashboard__side-panel--detail' : 'dashboard__chat'}`}>
            {detailNode ? (
              <>
                <div className="dashboard__chat-header">
                  <span className="terminal-label">NODE DETAIL</span>
                  <button
                    type="button"
                    className="detail-panel__close"
                    onClick={() => setDetailNode(null)}
                    aria-label="Close node details"
                  >
                    ×
                  </button>
                </div>
                <div className="dashboard__detail-content">
                  <span className="detail-panel__type">{detailNode.type}</span>
                  <h2 className="detail-panel__name">{detailNode.name}</h2>
                  {detailNode.summary && <p className="detail-panel__summary">{detailNode.summary}</p>}
                  {detailNode.points && detailNode.points.length > 0 && (
                    <ul className="detail-panel__points">
                      {detailNode.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="dashboard__chat-header"><span className="terminal-label">CHAT</span></div>
                <div className="dashboard__chat-messages">
                  {chatMessages.map((message, index) => (
                    <div key={index} className={`dashboard__message dashboard__message--${message.role}`}>
                      <div className="dashboard__message-content">{message.content}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="dashboard__chat-input-area">
                  <form onSubmit={handleChatSubmit} className="dashboard__chat-form">
                    <input
                      className="dashboard__chat-input"
                      placeholder="Ask..."
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                    />
                    <button type="submit" className="dashboard__chat-submit">→</button>
                  </form>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
