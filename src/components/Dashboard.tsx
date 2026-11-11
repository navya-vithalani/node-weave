import { useState, useRef, useEffect } from 'react';
import type { OriginalStructure, CustomInsight } from '../types/schema';
import PhysicsGraph from './PhysicsGraph';
import '../styles/dashboard.css';

interface DashboardProps {
  sessionName: string;
  structure: OriginalStructure;
  customInsights?: CustomInsight[];
}

export default function Dashboard(props: DashboardProps) {
  const [viewMode, setViewMode] = useState<'graph' | 'json'>('graph');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([
    { role: 'assistant', content: 'Ask me anything about your knowledge graph.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Based on your knowledge graph...' }]);
    }, 1000);
  };

  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <span className="terminal-label">SESSION</span>
          <h1 className="dashboard__title">{props.sessionName}</h1>
        </div>
        <div className="dashboard__header-center">
          <div className="dashboard__mode-toggle">
            <button className={`dashboard__mode-btn ${viewMode === 'graph' ? 'dashboard__mode-btn--active' : ''}`} onClick={() => setViewMode('graph')}>
              Graph
            </button>
            <button className={`dashboard__mode-btn ${viewMode === 'json' ? 'dashboard__mode-btn--active' : ''}`} onClick={() => setViewMode('json')}>
              JSON
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard__content">
        {viewMode === 'graph' ? (
          <PhysicsGraph structure={props.structure} />
        ) : (
          <div className="dashboard__json-viewer panel">
            <pre className="dashboard__json-content">{JSON.stringify(props.structure, null, 2)}</pre>
          </div>
        )}

        <aside className="dashboard__chat panel">
          <div className="dashboard__chat-header">
            <span className="terminal-label">CHAT</span>
          </div>
          <div className="dashboard__chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`dashboard__message dashboard__message--${msg.role}`}>
                <div className="dashboard__message-content">{msg.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="dashboard__chat-input-area">
            <form onSubmit={handleChatSubmit} className="dashboard__chat-form">
              <input className="dashboard__chat-input" placeholder="Ask..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
              <button type="submit" className="dashboard__chat-submit">→</button>
            </form>
          </div>
        </aside>
      </div>
    </main>
  );
}