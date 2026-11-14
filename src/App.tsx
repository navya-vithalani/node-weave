import { useState, useEffect, useCallback } from 'react';
import BootTutorial from './components/BootTutorial';
import Uploader from './components/Uploader';
import Loading, { DEMO_LOADING_DURATION_MS } from './components/Loading';
import Dashboard from './components/Dashboard';
import type { Chunk, ChunkStore, OriginalStructure, SessionImport } from './types/schema';
import { chunkDocument } from './lib/chunking';
import { embedBatch } from './lib/embeddings';
import magnetismPreview from '../tests/magnetism-output-insights.json';
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
  importedSessions: SessionImport[];
  isTest?: boolean; // Dev test mode - skip AI, simulate loading
}

interface ProcessingState {
  sessionName: string;
  status?: string;
  error?: string | null;
  onBackToUpload?: () => void;
  isDemo?: boolean;
  isComplete?: boolean;
}

const DEMO_STRUCTURE: OriginalStructure = {
  ...magnetismPreview,
  sessionName: 'Magnetism Insights Demo',
  topics: magnetismPreview.topics.map((topic) => ({
    ...topic,
    subtopics: topic.subtopics.map((subtopic) => ({
      ...subtopic,
      discrepancy: subtopic.discrepancy ?? undefined,
    })),
  })),
};

function App() {
  const [phase, setPhase] = useState<AppPhase>('boot');
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [resultStructure, setResultStructure] = useState<OriginalStructure | null>(null);
  const [resultChunkStore, setResultChunkStore] = useState<ChunkStore>({ chunks: [] });
  const [error, setError] = useState<string | null>(null);

  const buildChunkStore = async (files: UploaderData['files']): Promise<ChunkStore> => {
    const textChunks = files.flatMap((file) => file.content
      ? chunkDocument(file.id, file.content)
      : []);
    const chunks: Chunk[] = [];
    let embeddingFailure: string | null = null;
    for (let offset = 0; offset < textChunks.length; offset += 16) {
      const batch = textChunks.slice(offset, offset + 16);
      setProcessingState((previous) => previous ? {
        ...previous,
        status: `COMPUTING LOCAL MEMORY · ${Math.min(offset + batch.length, textChunks.length)}/${textChunks.length} NOTES`,
      } : previous);
      try {
        const embeddings = await embedBatch(batch.map((chunk) => chunk.text));
        chunks.push(...batch.map((chunk, index) => ({
          ...chunk,
          embedding: Array.from(embeddings[index]),
        })));
      } catch (error) {
        embeddingFailure = error instanceof Error ? error.message : String(error);
        chunks.push(...batch.map((chunk) => ({ ...chunk, embedding: [] })));
      }
    }

    if (embeddingFailure) {
      setProcessingState((previous) => previous ? {
        ...previous,
        status: `LOCAL SEMANTIC SEARCH UNAVAILABLE. Source notes are retained for keyword search. ${embeddingFailure}`,
      } : previous);
      return { chunks: chunks.map((chunk) => ({ ...chunk, embedding: [] })) };
    }

    return { chunks };
  };

  /* ---- Tutorial lifecycle ---- */

  const handleTutorialComplete = useCallback(() => {
    setPhase('upload');
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setPhase('upload');
  }, []);

  /* ---- Process new files through AI ---- */

  const processNewFiles = async (sessionName: string, files: UploaderData['files']): Promise<SessionImport> => {
    const documents = files.map(file => ({
      id: file.id,
      text: file.content || '',
    }));

    setProcessingState((previous) => previous ? { ...previous, status: 'ASKING THE MODEL TO SHAPE YOUR MAP…' } : previous);
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
    const chunkStore = await buildChunkStore(files);
    return { structure: result, chunkStore };
  };

  /* ---- Process single imported session (no AI needed) ---- */

  const processSingleSession = (sessionName: string, session: SessionImport): SessionImport => {
    return {
      structure: { ...session.structure, sessionName },
      chunkStore: session.chunkStore,
    };
  };

  /* ---- Merge multiple sessions through AI ---- */

  const processMultipleSessions = async (sessionName: string, sessions: SessionImport[]): Promise<SessionImport> => {
    const partialStructures = sessions.map(session => ({
      sessionName: session.structure.sessionName,
      createdAt: session.structure.createdAt,
      topics: session.structure.topics,
      connections: session.structure.connections,
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
    const preservedInsights = sessions.flatMap((session) => [
      ...(session.structure.customInsights ?? []),
      ...session.structure.topics.flatMap((topic) => topic.customInsights ?? []),
    ]);
    if (preservedInsights.length) {
      result.customInsights = [
        ...(result.customInsights ?? []),
        ...preservedInsights,
      ].filter((insight, index, list) => list.findIndex((item) => item.id === insight.id) === index);
    }
    const chunkStore: ChunkStore = {
      chunks: sessions.flatMap((session, sessionIndex) => session.chunkStore.chunks.map((chunk) => ({
        ...chunk,
        id: `session-${sessionIndex + 1}:${chunk.id}`,
      }))),
    };
    return { structure: result, chunkStore };
  };

  /* ---- Uploader lifecycle ---- */

  const handleUploaderContinue = useCallback(async (data: UploaderData) => {
    setError(null);

    const hasNewFiles = data.files.length > 0;
    const hasImportedSessions = data.importedSessions.length > 0;

    if (!hasNewFiles && !hasImportedSessions && !data.isTest) {
      setError('No files or sessions to process');
      return;
    }

    // Set loading state immediately
    setProcessingState({
      sessionName: data.isTest ? DEMO_STRUCTURE.sessionName : data.sessionName,
      isDemo: data.isTest,
    });
    setPhase('loading');

    if (data.isTest) return;

    try {
      let result: SessionImport;

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

      setResultChunkStore(result.chunkStore);
      setResultStructure(result.structure);
      setProcessingState((previous) => previous ? { ...previous, isComplete: true } : previous);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process';
      setError(errorMessage);
      // Error is shown in Loading screen, don't change phase
    }
  }, []);

  /* ---- Load the local preview fixture after its short demo progress ---- */
  useEffect(() => {
    if (phase !== 'loading' || !processingState?.isDemo || processingState.isComplete) return;

    const timeout = setTimeout(() => {
      setResultChunkStore({ chunks: [] });
      setResultStructure(DEMO_STRUCTURE);
      setProcessingState((previous) => previous ? { ...previous, isComplete: true } : previous);
    }, DEMO_LOADING_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [phase, processingState?.isDemo, processingState?.isComplete]);

  /* ---- Retry from upload on error ---- */

  const handleRetry = useCallback(() => {
    setError(null);
    setResultStructure(null);
    setProcessingState(null);
    setPhase('upload');
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setPhase('dashboard');
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
          isDemo={processingState.isDemo}
          onAnimationComplete={handleLoadingComplete}
        />
      )}

      {/* ---- Phase: Dashboard ---- */}
      {phase === 'dashboard' && resultStructure && (
        <Dashboard
          sessionName={resultStructure.sessionName}
          structure={resultStructure}
          chunkStore={resultChunkStore}
        />
      )}
    </div>
  );
}

export default App;