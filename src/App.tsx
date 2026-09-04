import { useState, useEffect, useCallback } from 'react';
import BootTutorial from './components/BootTutorial';
import Uploader from './components/Uploader';
import Loading from './components/Loading';
import Dashboard from './components/Dashboard';
import type { OriginalStructure } from './types/schema';
import './styles/global.css';

/* ---------------------------------------------------------------
   App — Root component
   Manages the application phase lifecycle:

     boot → upload → loading → dashboard

   Step 6 delivers the loading phase wired to the real pipeline.
   --------------------------------------------------------------- */

type AppPhase = 'boot' | 'upload' | 'loading' | 'dashboard';

interface UploaderData {
  sessionName: string;
  files: { id: string; name: string; type: string; size: number; content?: string }[];
  importedSessions: OriginalStructure[];
  isTest?: boolean; // Dev test mode - skip AI, simulate loading
}

interface ProcessingState {
  sessionName: string;
  status?: string;
  error?: string | null;
  onBackToUpload?: () => void;
  isComplete?: boolean;
}

function App() {
  const [phase, setPhase] = useState<AppPhase>('boot');
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [resultStructure, setResultStructure] = useState<OriginalStructure | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---- Tutorial lifecycle ---- */

  const handleTutorialComplete = useCallback(() => {
    setPhase('upload');
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setPhase('upload');
  }, []);

  /* ---- Process new files through AI ---- */

  const processNewFiles = async (sessionName: string, files: UploaderData['files']): Promise<OriginalStructure> => {
    const documents = files.map(file => ({
      id: file.id,
      text: file.content || '',
    }));

    const response = await fetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
    });

    // Handle non-JSON responses (like 504 timeouts or 500 errors)
    const text = await response.text();
    let errData;
    try {
      errData = JSON.parse(text);
    } catch {
      // Response is not JSON - show the raw error
      throw new Error(text || `Server error: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(errData?.error || `Structure request failed: ${response.status}`);
    }

    let result: OriginalStructure;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON response from server');
    }

    result.sessionName = sessionName;
    return result;
  };

  /* ---- Process single imported session (no AI needed) ---- */

  const processSingleSession = (sessionName: string, session: OriginalStructure): OriginalStructure => {
    return { ...session, sessionName };
  };

  /* ---- Merge multiple sessions through AI ---- */

  const processMultipleSessions = async (sessionName: string, sessions: OriginalStructure[]): Promise<OriginalStructure> => {
    const partialStructures = sessions.map(session => ({
      sessionName: session.sessionName,
      createdAt: session.createdAt,
      topics: session.topics,
      connections: session.connections,
    }));

    const response = await fetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'merge',
        structures: partialStructures,
      }),
    });

    // Handle non-JSON responses (like 504 timeouts or 500 errors)
    const text = await response.text();
    let errData;
    try {
      errData = JSON.parse(text);
    } catch {
      throw new Error(text || `Server error: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(errData?.error || `Merge request failed: ${response.status}`);
    }

    let result: OriginalStructure;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON response from server');
    }

    result.sessionName = sessionName;
    return result;
  };

  /* ---- Uploader lifecycle ---- */

  const handleUploaderContinue = useCallback(async (data: UploaderData) => {
    setError(null);

    const hasNewFiles = data.files.length > 0;
    const hasImportedSessions = data.importedSessions.length > 0;

    if (!hasNewFiles && !hasImportedSessions) {
      setError('No files or sessions to process');
      return;
    }

    // Set loading state immediately
    setProcessingState({ sessionName: data.sessionName });
    setPhase('loading');

    // Test mode: simulate 35 second loading without AI
    if (data.isTest) {
      setTimeout(() => {
        // Create empty structure for testing
        const emptyStructure: OriginalStructure = {
          sessionName: data.sessionName,
          createdAt: new Date().toISOString(),
          topics: [],
          connections: []
        };
        setResultStructure(emptyStructure);
      }, 35000);
      return;
    }

    try {
      let result: OriginalStructure;

      if (hasImportedSessions && data.importedSessions.length === 1 && !hasNewFiles) {
        // Single session restore - no AI needed
        result = processSingleSession(data.sessionName, data.importedSessions[0]);
      } else if (hasImportedSessions && data.importedSessions.length > 1 && !hasNewFiles) {
        // Multiple sessions merge - AI
        result = await processMultipleSessions(data.sessionName, data.importedSessions);
      } else {
        // New files - AI
        result = await processNewFiles(data.sessionName, data.files);
      }

      setResultStructure(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process';
      setError(errorMessage);
      // Error is shown in Loading screen, don't change phase
    }
  }, []);

  /* ---- Auto-transition to dashboard when processing completes ---- */

  useEffect(() => {
    if (phase === 'loading' && resultStructure && !error) {
      setPhase('dashboard');
    }
  }, [phase, resultStructure, error]);

  /* ---- Retry from upload on error ---- */

  const handleRetry = useCallback(() => {
    setError(null);
    setResultStructure(null);
    setProcessingState(null);
    setPhase('upload');
  }, []);

  /* ---- Render ---- */

  return (
    <div className="app" data-theme="dark">
      {/* ---- Navbar (persists across all phases) ---- */}
      <header className="navbar">
        <span className="navbar__title">NodeWeave</span>
        <span className="navbar__mascot">{'/ᐠ｡ꞈ｡ᐟ\\'}</span>
      </header>

      {/* ---- Phase: Boot tutorial ---- */}
      {phase === 'boot' && (
        <BootTutorial
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {/* ---- Phase: Upload ---- */}
      {phase === 'upload' && (
        <Uploader onContinue={handleUploaderContinue} />
      )}

      {/* ---- Phase: Loading ---- */}
      {phase === 'loading' && processingState && (
        <Loading
          sessionName={processingState.sessionName}
          status={processingState.status}
          error={error}
          onBackToUpload={handleRetry}
          isComplete={processingState.isComplete}
        />
      )}

      {/* ---- Phase: Dashboard ---- */}
      {phase === 'dashboard' && resultStructure && (
        <Dashboard
          sessionName={resultStructure.sessionName}
          structure={resultStructure}
        />
      )}
    </div>
  );
}

export default App;