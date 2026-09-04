import { useState, useCallback, useRef, useEffect } from 'react';
import type { OriginalStructure, Topic, Connection } from '../types/schema';
import '../styles/dashboard.css';

interface DashboardProps {
  sessionName: string;
  structure: OriginalStructure;
}

// Simple node type for our graph
interface GraphNode {
  id: string;
  label: string;
  type: 'topic' | 'subtopic';
  parentId?: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export default function Dashboard({ sessionName, structure }: DashboardProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'json'>('graph');
  const [editMode, setEditMode] = useState(false);
  const [showSubtopics, setShowSubtopics] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, citations?: string[]}>>([
    { role: 'assistant', content: 'Ask me anything about your knowledge graph. I\'ll answer based on your source materials.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Build graph data from structure
  const buildGraphData = useCallback(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    structure.topics.forEach((topic, topicIndex) => {
      // Add topic node
      nodes.push({
        id: `topic-${topicIndex}`,
        label: topic.title,
        type: 'topic',
        x: 200 + topicIndex * 300,
        y: 100
      });

      if (showSubtopics) {
        topic.subtopics.forEach((subtopic, subIndex) => {
          nodes.push({
            id: `subtopic-${topicIndex}-${subIndex}`,
            label: subtopic.title,
            type: 'subtopic',
            parentId: `topic-${topicIndex}`,
            x: 200 + topicIndex * 300 + (subIndex % 3) * 120,
            y: 250 + Math.floor(subIndex / 3) * 100
          });

          // Edge from topic to subtopic
          edges.push({
            id: `edge-${topicIndex}-${subIndex}`,
            source: `topic-${topicIndex}`,
            target: `subtopic-${topicIndex}-${subIndex}`
          });
        });
      }
    });

    // Add connection edges
    structure.connections.forEach((conn, index) => {
      if (conn.fromTopic !== undefined && conn.toTopic !== undefined) {
        edges.push({
          id: `conn-${index}`,
          source: `topic-${conn.fromTopic}`,
          target: `topic-${conn.toTopic}`,
          type: 'connection'
        });
      }
    });

    return { nodes, edges };
  }, [structure, showSubtopics]);

  const { nodes, edges } = buildGraphData();

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    // Simulate AI response (in real app, call /api/chat)
    setTimeout(() => {
      const responses = [
        'Based on your knowledge graph, this concept connects to several key topics. The structure shows multiple relationships that can help explain the underlying principles.',
        'I found relevant information in your sources. The main ideas point to a hierarchical organization where each topic builds on fundamental concepts.',
        'Looking at the connections in your graph, this concept has bidirectional links to other topics, suggesting it serves as a bridge between different areas of study.'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: randomResponse,
        citations: ['source-1.txt', 'source-2.pdf']
      }]);
      setIsChatLoading(false);
    }, 1500);
  };

  const handleExport = (type: 'original' | 'working' | 'both') => {
    const exportData = {
      sessionName,
      exportedAt: new Date().toISOString(),
      original: structure,
      customInsights: [],
      modified: false
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/\s+/g, '-')}-${type}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const catMascot = '/ᐠ｡ꞈ｡ᐟ\\';

  return (
    <main className="dashboard">
      {/* Header */}
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <span className="terminal-label">SESSION</span>
          <h1 className="dashboard__title">{sessionName}</h1>
          <span className="dashboard__date">
            {new Date(structure.createdAt).toLocaleString()} • {structure.topics.length} topics
          </span>
        </div>

        <div className="dashboard__header-center">
          <div className="dashboard__mode-toggle">
            <button
              className={`dashboard__mode-btn ${viewMode === 'graph' ? 'dashboard__mode-btn--active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              Graph
            </button>
            <button
              className={`dashboard__mode-btn ${viewMode === 'json' ? 'dashboard__mode-btn--active' : ''}`}
              onClick={() => setViewMode('json')}
            >
              JSON
            </button>
          </div>
        </div>

        <div className="dashboard__header-right">
          <div className="dashboard__edit-toggle">
            <button
              className={`dashboard__edit-btn ${editMode ? 'dashboard__edit-btn--active' : ''}`}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? 'Edit Mode' : 'View Mode'}
            </button>
          </div>

          {viewMode === 'graph' && (
            <label className="dashboard__subtopic-toggle">
              <input
                type="checkbox"
                checked={showSubtopics}
                onChange={(e) => setShowSubtopics(e.target.checked)}
              />
              <span>Show Subtopics</span>
            </label>
          )}

          <div className="dashboard__export">
            <button
              className="dashboard__export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              Export ▾
            </button>
            {showExportMenu && (
              <div className="dashboard__export-menu">
                <button onClick={() => handleExport('original')}>
                  Original Structure
                </button>
                <button onClick={() => handleExport('working')}>
                  Working Copy
                </button>
                <button onClick={() => handleExport('both')}>
                  Both (Complete)
                </button>
              </div>
            )}
          </div>

          <span className="dashboard__mascot">{catMascot}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="dashboard__content">
        {/* Left: Graph Canvas */}
        <div className="dashboard__canvas">
          {viewMode === 'graph' ? (
            <div className="dashboard__graph panel">
              <div className="dashboard__graph-header">
                <span className="terminal-label">KNOWLEDGE GRAPH</span>
                <span className="dashboard__graph-info">
                  {nodes.length} nodes • {edges.length} edges
                </span>
              </div>

              <div className="dashboard__graph-container">
                {nodes.length === 0 ? (
                  <div className="dashboard__placeholder">
                    <div className="dashboard__placeholder-content">
                      <span className="dashboard__placeholder-icon">🗺️</span>
                      <p>No topics yet. Upload documents to generate your knowledge graph.</p>
                    </div>
                  </div>
                ) : (
                  <div className="dashboard__graph-svg">
                    {/* Render edges */}
                    <svg className="dashboard__edges">
                      {edges.map((edge) => {
                        const sourceNode = nodes.find(n => n.id === edge.source);
                        const targetNode = nodes.find(n => n.id === edge.target);
                        if (!sourceNode || !targetNode || !sourceNode.x || !sourceNode.y || !targetNode.x || !targetNode.y) return null;
                        return (
                          <line
                            key={edge.id}
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            className={`dashboard__edge ${edge.type === 'connection' ? 'dashboard__edge--connection' : ''}`}
                          />
                        );
                      })}
                    </svg>

                    {/* Render nodes */}
                    {nodes.map((node) => (
                      <div
                        key={node.id}
                        className={`dashboard__node dashboard__node--${node.type} ${editMode ? 'dashboard__node--editable' : ''}`}
                        style={{
                          left: node.x ? node.x - 60 : 0,
                          top: node.y ? node.y - 25 : 0
                        }}
                        draggable={editMode}
                      >
                        <div className="dashboard__node-label">{node.label}</div>
                        {node.type === 'topic' && (
                          <div className="dashboard__node-children-count">
                            {structure.topics[parseInt(node.id.split('-')[1])]?.subtopics.length || 0}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="dashboard__json-viewer panel">
              <div className="dashboard__json-header">
                <span className="terminal-label">STRUCTURE OUTPUT</span>
                <span className="dashboard__json-badge">Raw JSON</span>
              </div>
              <pre className="dashboard__json-content">
                {JSON.stringify(structure, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right: Chat Sidebar */}
        <aside className="dashboard__chat panel">
          <div className="dashboard__chat-header">
            <span className="terminal-label">CHAT</span>
            <span className="dashboard__chat-budget">Budget: 75%</span>
          </div>

          <div className="dashboard__chat-messages">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`dashboard__message dashboard__message--${msg.role}`}>
                <div className="dashboard__message-content">
                  {msg.content}
                  {msg.citations && (
                    <div className="dashboard__citations">
                      {msg.citations.map((cite, i) => (
                        <span key={i} className="dashboard__citation-chip">{cite}</span>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'assistant' && index > 0 && (
                  <div className="dashboard__message-actions">
                    <button className="dashboard__action-btn" title="Add insight to graph">
                      ✨ Add Insight
                    </button>
                    <button className="dashboard__action-btn dashboard__action-btn--reject" title="Reject">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isChatLoading && (
              <div className="dashboard__message dashboard__message--assistant dashboard__message--loading">
                <span className="dashboard__typing-indicator">
                  <span></span><span></span><span></span>
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="dashboard__chat-input-area">
            <form onSubmit={handleChatSubmit} className="dashboard__chat-form">
              <input
                type="text"
                className="dashboard__chat-input"
                placeholder="Ask about your knowledge graph..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
              />
              <button
                type="submit"
                className="dashboard__chat-submit"
                disabled={!chatInput.trim() || isChatLoading}
              >
                →
              </button>
            </form>
            <p className="dashboard__chat-disclaimer">
              AI responses are generated and may contain errors. Always verify important information.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}