import { useState, useEffect, useRef } from 'react';
import '../styles/loading.css';

export const DEMO_LOADING_DURATION_MS = 16_000;

interface LoadingProps {
  sessionName: string;
  status?: string;
  error?: string | null;
  onBackToUpload?: () => void;
  isComplete?: boolean;
  isDemo?: boolean;
  onAnimationComplete: () => void;
}

const CAT_FRAMES = [
  ' /\\_/\\\\\n( o.o )\n > ^ <',
  ' /\\_/\\\\\n( ^.^ )\n > ^ <',
  ' /\\_/\\\\\n( o.o )\n > ^ <',
];

const DEMO_STEPS = [
  'Opening the local sample map',
  'Reading the saved map structure',
  'Loading topics and connections',
  'Checking the map before handoff',
];

const COMPLETION_LINE = 'Mapping complete. Your knowledge map is ready.';

const FUN_LINES = [
  'The cat is thinking hard. Please respect the whiskers.',
  'Consulting the oracle (it says: looking good).',
  'Untangling one particularly curly thought...',
  'The oracle has requested a tiny dramatic pause.',
  'Miso is inspecting the connections. Very serious work.',
  'A little patience while the ideas find their seats...',
];

const LIVE_WAIT_LINES = [
  'Keeping the idea threads tidy...',
  'Giving the map a little breathing room...',
  'Checking that the connections make sense...',
];

interface ConsoleLine {
  id: number;
  text: string;
  isAside?: boolean;
}

export default function Loading({
  sessionName,
  status,
  error,
  onBackToUpload,
  isComplete,
  isDemo,
  onAnimationComplete,
}: LoadingProps) {
  const [currentCatFrame, setCurrentCatFrame] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [activeLine, setActiveLine] = useState<ConsoleLine | null>(null);
  const [typedText, setTypedText] = useState('');
  const consoleOutputRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<ConsoleLine | null>(null);
  const lineIdRef = useRef(0);
  const statusRef = useRef(status);
  const completionStartedRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (error) {
      setHasError(true);
    }
  }, [error]);

  useEffect(() => {
    if (hasError || showCompletion) return;

    const interval = setInterval(() => {
      setCurrentCatFrame(frame => (frame + 1) % CAT_FRAMES.length);
    }, 650);
    return () => clearInterval(interval);
  }, [hasError, showCompletion]);

  useEffect(() => {
    if (hasError || isComplete) return;

    let taskIndex = 0;
    let lineCount = 0;
    let lastFunLine = '';
    let lastStatusLine = '';
    let timeout: ReturnType<typeof setTimeout>;

    const writeNextLine = () => {
      const previousLine = activeLineRef.current;
      if (previousLine) setConsoleLines((lines) => [...lines, previousLine]);

      let text: string;
      let isAside = false;
      if (lineCount === 0) {
        text = `nodeweave init --${isDemo ? 'preview' : 'session'}`;
      } else if (isDemo && taskIndex < DEMO_STEPS.length && lineCount % 3 !== 2) {
        text = DEMO_STEPS[taskIndex];
        taskIndex += 1;
      } else if (!isDemo && statusRef.current && statusRef.current !== lastStatusLine) {
        text = statusRef.current;
        lastStatusLine = text;
      } else {
        const choices = isDemo ? FUN_LINES : LIVE_WAIT_LINES;
        const available = choices.filter((line) => line !== lastFunLine);
        text = available[Math.floor(Math.random() * available.length)];
        lastFunLine = text;
        isAside = Boolean(isDemo);
      }

      const line = { id: lineIdRef.current++, text, isAside };
      activeLineRef.current = line;
      setActiveLine(line);
      lineCount += 1;
      timeout = setTimeout(writeNextLine, 2_000 + Math.random() * 2_000);
    };

    timeout = setTimeout(writeNextLine, 250);
    return () => clearTimeout(timeout);
  }, [isDemo, isComplete, hasError]);

  useEffect(() => {
    if (!activeLine) return;

    let characterIndex = 0;
    setTypedText('');
    const interval = setInterval(() => {
      characterIndex += 1;
      setTypedText(activeLine.text.slice(0, characterIndex));
      if (characterIndex >= activeLine.text.length) clearInterval(interval);
    }, 18);

    return () => clearInterval(interval);
  }, [activeLine]);

  useEffect(() => {
    const output = consoleOutputRef.current;
    if (!output) return;

    const frame = requestAnimationFrame(() => {
      output.scrollTop = output.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [consoleLines, typedText]);

  useEffect(() => {
    if (!isComplete || completionStartedRef.current) return;
    completionStartedRef.current = true;

    const finalLine = activeLineRef.current;
    if (finalLine) setConsoleLines((lines) => [...lines, finalLine]);
    activeLineRef.current = null;
    setActiveLine({
      id: lineIdRef.current++,
      text: COMPLETION_LINE,
    });
  }, [isComplete]);

  useEffect(() => {
    if (!isComplete || !activeLine || activeLine.text !== COMPLETION_LINE || typedText !== COMPLETION_LINE) return;

    const revealTimeout = setTimeout(() => setShowCompletion(true), 500);
    return () => clearTimeout(revealTimeout);
  }, [isComplete, activeLine, typedText]);

  useEffect(() => {
    if (!showCompletion) return;

    const finishTimeout = setTimeout(onAnimationComplete, 1_900);
    return () => clearTimeout(finishTimeout);
  }, [showCompletion, onAnimationComplete]);

  useEffect(() => {
    if (hasError || showCompletion || isComplete) return;

    const timeout = setTimeout(() => {
      setHasError(true);
    }, 70000);

    return () => clearTimeout(timeout);
  }, [hasError, showCompletion, isComplete]);

  return (
    <main className="loading">
      <section className={`loading__terminal ${showCompletion ? 'loading__terminal--fading' : ''}`} aria-label="NodeWeave loading terminal">
        <header className="loading__terminal-bar">
          <div className="loading__terminal-lights" aria-hidden="true"><i /><i /><i /></div>
          <span>nodeweave://workspace/boot</span>
          <span className="loading__terminal-version">v1.0</span>
        </header>

        <div className="loading__terminal-body">
          <div className="loading__terminal-heading">
            <p className="loading__eyebrow">KNOWLEDGE MAP INITIALIZER <span>{isDemo ? '· LOCAL PREVIEW' : '· LIVE SESSION'}</span></p>
            <h1>{hasError ? 'PROCESS INTERRUPTED' : showCompletion ? 'MAP READY' : 'PREPARING YOUR MAP'}</h1>
            <p className="loading__session"><span>SESSION</span> {sessionName}</p>
          </div>

          <div className="loading__console">
            <div className="loading__console-output" ref={consoleOutputRef} role="log" aria-live="polite" aria-label="Loading progress log">
              {consoleLines.map((line) => (
                <p className={`loading__console-line ${line.isAside ? 'loading__console-line--aside' : ''}`} key={line.id}>
                  <span className="loading__console-prompt">&gt;&gt;</span><span>{line.text}</span>
                </p>
              ))}
              {activeLine && (
                <p className={`loading__console-line ${activeLine.isAside ? 'loading__console-line--aside' : ''}`}>
                  <span className="loading__console-prompt">&gt;&gt;</span>
                  <span>
                    {typedText}
                    {typedText !== activeLine.text && <span className="loading__cursor">▋</span>}
                  </span>
                </p>
              )}
              {hasError && <p className="loading__console-error">&gt;&gt; {error || 'This is taking longer than expected.'}</p>}
            </div>
            {isDemo && <p className="loading__console-note">local preview · sample data · no AI request</p>}
            <div className="loading__console-rule" />
            <p className="loading__console-footer"><span>NODEWEAVE</span><span>{hasError ? 'NEEDS ATTENTION' : showCompletion ? 'READY TO EXPLORE' : isDemo ? 'PREVIEW MODE' : 'WORKING…'}</span></p>
          </div>

        {hasError && (
          <div className="loading__error">
            <button type="button" className="loading__back-btn" onClick={onBackToUpload}>
              <span>↶</span> Return to upload
            </button>
          </div>
        )}
        </div>
      </section>

      <div className={`loading__mascot ${showCompletion ? 'loading__mascot--center' : ''} ${hasError ? 'loading__mascot--sad' : ''}`} aria-hidden="true">
        <pre className="loading__cat">{hasError ? ' /\\_/\\\\\n( ;_; )\n > ^ <' : CAT_FRAMES[currentCatFrame]}</pre>
        {showCompletion && <span className="loading__speech">done!</span>}
      </div>

      {showCompletion && (
        <p className="loading__completion" role="status" aria-live="polite">Your map is ready!</p>
      )}
    </main>
  );
}