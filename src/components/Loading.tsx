import { useState, useEffect, useRef } from 'react';
import '../styles/loading.css';

interface LoadingProps {
  sessionName: string;
  status?: string;
  error?: string | null;
  onBackToUpload?: () => void;
  isComplete?: boolean;
}

// Terminal header shown at start
const TERMINAL_HEADER = [
  'NodeWeave v1.0.4 — Local-first Knowledge Graph Builder',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'Processing documents locally. Your data never leaves this device.',
  '',
];

// Core processing steps that cycle
const PROCESSING_STEPS = [
  'Reading source documents...',
  'Splitting content into logical chunks...',
  'Generating embeddings (in-browser)...',
  'Analyzing relationships between concepts...',
  'Constructing knowledge graph structure...',
  'Refining node connections...',
  'Calculating layout positions...',
  'Applying visual styling...',
];

// Creative messages for long waits (>15s)
const CREATIVE_WAIT_MESSAGES = [
  "🐱 Taking a moment... the cat is thinking hard...",
  "⏳ This is taking longer than expected... patience...",
  "🔮 Consulting the oracle... almost there...",
  "🎲 Rolling the dice on optimal graph layout...",
  "🌊 Riding the wave of computation...",
  "🧩 Solving the puzzle... piece by piece...",
  "🚀 Plotting trajectories through idea space...",
  "📡 Scanning for knowledge signals...",
];

// Sad cat for errors
const SAD_CAT = `      /ᐠ｡ꞈ｡ᐟ\\
      |  ;_;  |  < oh no...
      (  ) (  )`;

// Large ASCII cat animation frames
const CAT_FRAMES = [
  `      /ᐠ｡ꞈ｡ᐟ\\
      |  ≡ ≡ |
      (  ) (  )`,
  `      /ᐠ｡ꞈ｡ᐟ\\
      |  ─ ─ |
      (  ) (  )`,
  `      /ᐠ｡ꞈ｡ᐟ\\
      |  ⊙ ⊙ |  < hey there!
      (  ) (  )`,
  `      /\\_/\\
     ( o.o )
      > ^ <`,
  `      /\\_/\\
     ( ^_^ )  < purr
      /   \\`,
  `      /\\_/\\
     ( >.< )  < focused
      \\___/`,
  `      /\\_/\\
     ( ∗_∗ )  < almost...
      \\___/`,
  `      /\\_/\\
     ( ◉_◉ )  < ready!!
      \\___/`,
];

export default function Loading({ status, error, onBackToUpload, isComplete }: LoadingProps) {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [currentCatFrame, setCurrentCatFrame] = useState(0);
  const [streamedText, setStreamedText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showCompletion, setShowCompletion] = useState(false);
  const [hasError, setHasError] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Set error state
  useEffect(() => {
    if (error) {
      setHasError(true);
    }
  }, [error]);

  // Animate cat frames (stop on error)
  useEffect(() => {
    if (hasError || showCompletion) return;

    const interval = setInterval(() => {
      setCurrentCatFrame(frame => (frame + 1) % CAT_FRAMES.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [hasError, showCompletion]);

  // Blinking cursor (stop on error)
  useEffect(() => {
    if (hasError) return;

    const interval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 600);
    return () => clearInterval(interval);
  }, [hasError]);

  // Completion trigger
  useEffect(() => {
    if (isComplete) {
      setTimeout(() => setShowCompletion(true), 500);
    }
  }, [isComplete]);

  // Timeout after 70 seconds
  useEffect(() => {
    if (hasError || showCompletion || isComplete) return;

    const timeout = setTimeout(() => {
      setHasError(true);
      setVisibleLines(prev => [...prev, 9999]); // Add timeout error line
    }, 70000);

    return () => clearTimeout(timeout);
  }, [hasError, showCompletion, isComplete]);

  // Show terminal header first (skip on error)
  useEffect(() => {
    if (hasError || showCompletion) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    TERMINAL_HEADER.forEach((_, index) => {
      const timeout = setTimeout(() => {
        setVisibleLines(prev => [...prev, -1 - index]);
      }, index * 300);
      timeouts.push(timeout);
    });

    // Start processing steps after header
    const startProcessing = setTimeout(() => {
      PROCESSING_STEPS.forEach((_, index) => {
        const timeout = setTimeout(() => {
          setVisibleLines(prev => [...prev, index]);
          logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, index * 3000);
        timeouts.push(timeout);
      });

      // Creative messages after 15 seconds
      const creativeTimeout = setTimeout(() => {
        CREATIVE_WAIT_MESSAGES.forEach((_, index) => {
          const timeout = setTimeout(() => {
            setVisibleLines(prev => [...prev, 1000 + index]);
            logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }, index * 5000);
          timeouts.push(timeout);
        });
      }, 15000);
      timeouts.push(creativeTimeout);
    }, TERMINAL_HEADER.length * 300 + 500);
    timeouts.push(startProcessing);

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [hasError, showCompletion]);

  // Streaming text effect
  useEffect(() => {
    if (status && !hasError) {
      let charIndex = 0;
      const text = '[STREAMING STRUCTURAL JSON]';
      const streamInterval = setInterval(() => {
        if (charIndex <= text.length) {
          setStreamedText(text.slice(0, charIndex));
          charIndex++;
        } else {
          clearInterval(streamInterval);
        }
      }, 30);
      return () => clearInterval(streamInterval);
    }
  }, [status, hasError]);

  const allLines = [
    ...TERMINAL_HEADER.map((line, i) => ({ type: 'header' as const, text: line, id: -1 - i })),
    ...PROCESSING_STEPS.map((text, i) => ({ type: 'step' as const, text, id: i })),
    ...CREATIVE_WAIT_MESSAGES.map((text, i) => ({ type: 'creative' as const, text, id: 1000 + i })),
    { type: 'error' as const, text: '⏱️ Operation timed out. The server might be overloaded or the document is too large. Try again with fewer or smaller documents.', id: 9999 },
  ];

  const sortedVisibleLines = allLines
    .filter(line => visibleLines.includes(line.id))
    .sort((a, b) => a.id - b.id);

  return (
    <main className="loading loading--fullscreen">
      <div className={`loading__terminal-full ${showCompletion ? 'loading__terminal-full--complete' : ''} ${hasError ? 'loading__terminal-full--error' : ''}`}>
        <div className="loading__terminal-content-full">
          {/* Cat mascot */}
          <div className={`loading__cat ${showCompletion ? 'loading__cat--center' : ''} ${hasError ? 'loading__cat--sad' : ''}`}>
            <pre className="loading__cat-frame">{hasError ? SAD_CAT : (showCompletion ? CAT_FRAMES[CAT_FRAMES.length - 1] : CAT_FRAMES[currentCatFrame])}</pre>
          </div>

          {/* Completion message */}
          {showCompletion && (
            <div className="loading__completion">
              <div className="loading__completion-text">Your map is ready!</div>
              <div className="loading__completion-cat">{CAT_FRAMES[CAT_FRAMES.length - 1]}</div>
            </div>
          )}

          {/* Terminal lines */}
          {!showCompletion && (
            <div className="loading__lines-area">
              {sortedVisibleLines.map((line) => (
                <div
                  key={line.id}
                  className={`loading__log-line-full ${
                    line.type === 'header' ? 'loading__log-line--header' :
                    line.type === 'creative' ? 'loading__log-line--creative' :
                    line.type === 'error' ? 'loading__log-line--error' :
                    'loading__log-line--step'
                  } ${visibleLines.includes(line.id) ? 'visible' : ''}`}
                >
                  {line.type === 'header' ? (
                    <span className="loading__header-text">{line.text}</span>
                  ) : line.type === 'creative' ? (
                    <>
                      <span className="loading__arrow">💬</span>
                      <span className="loading__log-text loading__log-text--creative">{line.text}</span>
                    </>
                  ) : line.type === 'error' ? (
                    <>
                      <span className="loading__arrow">⏱️</span>
                      <span className="loading__log-text loading__log-text--error">{line.text}</span>
                    </>
                  ) : (
                    <>
                      <span className="loading__arrow">›</span>
                      <span className="loading__log-text">{line.text}</span>
                      {status && line.id === PROCESSING_STEPS.length - 1 && (
                        <span className="loading__streaming">
                          {streamedText}
                          <span className={`loading__cursor-inline ${cursorVisible ? 'visible' : ''}`}>
                            ▋
                          </span>
                        </span>
                      )}
                      {status && line.id === PROCESSING_STEPS.length - 1 && (
                        <span className="loading__ok">[OK]</span>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Prompt line */}
              {!status && !error && !hasError && (
                <div className="loading__prompt-line">
                  <span className="loading__arrow">›</span>
                  <span className="loading__cursor-blink">▋</span>
                </div>
              )}

              {/* Error section - only on real errors */}
              {(error || (hasError && !isComplete)) && (
                <div className="loading__error-section">
                  {error && (
                    <div className="loading__log-line-full loading__log-line--error visible">
                      <span className="loading__arrow">⛔</span>
                      <span className="loading__log-text loading__log-text--error">{error}</span>
                    </div>
                  )}
                  <button
                    className="loading__back-btn"
                    onClick={onBackToUpload}
                  >
                    ← Back to Upload
                  </button>
                </div>
              )}

              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}