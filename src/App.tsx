import { useState, useCallback, useEffect } from 'react';
import BootTutorial from './components/BootTutorial';
import Uploader from './components/Uploader';
import { applyTheme, loadSavedTheme } from './lib/theme';
import type { OriginalStructure } from './types/schema';
import './styles/global.css';

/* ---------------------------------------------------------------
   App — Root component
   Manages the application phase lifecycle:

     boot → upload → loading → dashboard

   Step 4 delivers the boot phase (Phase 1 tutorial modal) and
   the shell that hosts all subsequent phases.
   --------------------------------------------------------------- */

type AppPhase = 'boot' | 'upload' | 'loading' | 'dashboard';

interface UploaderData {
  sessionName: string;
  files: { id: string; name: string; type: string; size: number; content?: string }[];
  importedSessions: OriginalStructure[];
}

function App() {
  const [phase, setPhase] = useState<AppPhase>('boot');

  /* ---- Load saved theme ---- */

  useEffect(() => {
    const saved = loadSavedTheme();
    if (saved) applyTheme(saved);
  }, []);

  /* ---- Tutorial lifecycle ---- */

  const handleTutorialComplete = useCallback(() => {
    setPhase('upload');
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setPhase('upload');
  }, []);

  /* ---- Uploader lifecycle ---- */

  const handleUploaderContinue = useCallback((data: UploaderData) => {
    // TODO: Process files and transition to loading
    console.log('Uploader data:', data);
    setPhase('loading');
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
    </div>
  );
}

export default App;
