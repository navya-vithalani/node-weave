import { useState, useCallback } from 'react';
import BootTutorial from './components/BootTutorial';

/* ---------------------------------------------------------------
   App — Root component
   Manages the application phase lifecycle:

     boot → upload → loading → dashboard

   Step 4 delivers the boot phase (Phase 1 tutorial modal) and
   the shell that hosts all subsequent phases.
   --------------------------------------------------------------- */

type AppPhase = 'boot' | 'upload' | 'loading' | 'dashboard';

function App() {
  const [phase, setPhase] = useState<AppPhase>('boot');

  /* ---- Tutorial lifecycle ---- */

  const handleTutorialComplete = useCallback(() => {
    setPhase('upload');
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setPhase('upload');
  }, []);

  /* ---- Render ---- */

  return (
    <div className="app" data-theme="dark">
      {/* ---- Navbar (persists across all phases) ---- */}
      <header className="navbar">
        <span className="navbar__title">NodeWeave</span>
      </header>

      {/* ---- Phase: Boot tutorial ---- */}
      {phase === 'boot' && (
        <BootTutorial
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {/* ---- Phase: Upload (placeholder — built in Step 5) ---- */}
      {phase === 'upload' && (
        <main className="phase-placeholder">
          <pre className="phase-placeholder__ascii">{`
  ┌──────────────────────────────────────────┐
  │                                          │
  │     >>> UPLOADER PHASE                   │
  │     Ready — awaiting Step 5              │
  │                                          │
  └──────────────────────────────────────────┘
          `}</pre>
        </main>
      )}
    </div>
  );
}

export default App;
