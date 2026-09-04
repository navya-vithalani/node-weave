import { useState, useEffect } from 'react';
import '../styles/loading.css';

interface LoadingProps {
  sessionName: string;
  status?: string;
}

const STATUS_STEPS = [
  'Reading and chunking source documents...',
  'Generating embeddings for semantic search...',
  'Sending documents to AI for structuring...',
  'AI is analyzing relationships between topics...',
  'Building hierarchical knowledge graph...',
  'Finalizing your map...',
];

export default function Loading({ sessionName, status }: LoadingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dots, setDots] = useState('');

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Rotate through steps if no custom status provided
  useEffect(() => {
    if (status) return;

    const interval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % STATUS_STEPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [status]);

  const displayStatus = status || STATUS_STEPS[currentStep];

  return (
    <main className="loading">
      <div className="loading__card panel">
        <div className="loading__header">
          <span className="terminal-label">STRUCTURING</span>
          <h2 className="loading__title">Building your knowledge graph</h2>
          <p className="loading__subtitle">
            Processing: <span className="loading__session-name">{sessionName}</span>
          </p>
        </div>

        <div className="loading__terminal">
          <div className="loading__terminal-content">
            <div className="loading__status-line">
              <span className="loading__cursor">❯</span>
              <span className="loading__status-text">{displayStatus}</span>
              <span className="loading__dots">{dots}</span>
            </div>
          </div>
        </div>

        <div className="loading__progress">
          <div className="loading__progress-bar">
            <div
              className="loading__progress-fill"
              style={{
                width: status
                  ? '60%'
                  : `${((currentStep + (dots ? 0.5 : 0)) / STATUS_STEPS.length) * 100}%`
              }}
            />
          </div>
        </div>

        <p className="loading__hint">
          This may take a moment depending on the size of your documents.
        </p>
      </div>
    </main>
  );
}