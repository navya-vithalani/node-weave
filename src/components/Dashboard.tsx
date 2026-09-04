import type { OriginalStructure } from '../types/schema';
import '../styles/dashboard.css';

interface DashboardProps {
  sessionName: string;
  structure: OriginalStructure;
}

export default function Dashboard({ sessionName, structure }: DashboardProps) {
  const topicCount = structure.topics.length;
  const subtopicCount = structure.topics.reduce((acc, t) => acc + t.subtopics.length, 0);
  const connectionCount = structure.connections.length;

  return (
    <main className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__header-left">
          <span className="terminal-label">SESSION</span>
          <h1 className="dashboard__title">{sessionName}</h1>
          <span className="dashboard__date">{new Date(structure.createdAt).toLocaleString()}</span>
        </div>
        <div className="dashboard__header-right">
          <div className="dashboard__stats">
            <span className="dashboard__stat">
              <span className="dashboard__stat-value">{topicCount}</span> topics
            </span>
            <span className="dashboard__stat">
              <span className="dashboard__stat-value">{subtopicCount}</span> subtopics
            </span>
            <span className="dashboard__stat">
              <span className="dashboard__stat-value">{connectionCount}</span> connections
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard__content">
        <div className="dashboard__json-viewer panel">
          <div className="dashboard__json-header">
            <span className="terminal-label">STRUCTURE OUTPUT</span>
            <span className="dashboard__json-badge">Raw JSON</span>
          </div>
          <pre className="dashboard__json-content">
            {JSON.stringify(structure, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}