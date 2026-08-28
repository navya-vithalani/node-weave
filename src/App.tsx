import { useState, useCallback, useEffect } from 'react';
import BootTutorial from './components/BootTutorial';
import { applyTheme, loadSavedTheme } from './lib/theme';

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
        <main className="uploader">
          <div className="uploader__card panel">
            <div className="uploader__header">
              <span className="terminal-label">SOURCE INGEST</span>
              <h2 className="uploader__title">Build a knowledge graph from your materials.</h2>
              <p className="uploader__subtitle">
                Drop in PDFs, notes, articles, or transcripts. NodeWeave extracts
                the ideas and maps them — locally, privately, in your browser.
              </p>
            </div>

            <div className="uploader__dropzone">
              <div className="uploader__dropzone-content">
                <span className="uploader__dropzone-icon">▤</span>
                <p className="uploader__dropzone-text">
                  Drop files here &mdash; <span className="uploader__accent">.pdf</span>,{' '}
                  <span className="uploader__accent">.txt</span>,{' '}
                  <span className="uploader__accent">.md</span>
                </p>
                <p className="uploader__hint">or paste a session name below</p>
              </div>
            </div>

            <div className="uploader__session">
              <label className="uploader__session-label">
                <span className="terminal-label">SESSION NAME</span>
                <input
                  className="uploader__session-input"
                  type="text"
                  placeholder="Untitled Map"
                  readOnly
                />
              </label>
            </div>

            <div className="uploader__guide">
              <span className="terminal-label">SUPPORTED SOURCES</span>
              <ul className="uploader__guide-list">
                <li>
                  <strong>PDF</strong>
                  <span className="uploader__guide-desc">Drop it directly — we extract the text automatically.</span>
                </li>
                <li>
                  <strong>Slide decks</strong>
                  <span className="uploader__guide-desc">Export as PDF (File → Export → PDF), then drop it here.</span>
                </li>
                <li>
                  <strong>Web articles</strong>
                  <span className="uploader__guide-desc">Save as .md (browser extension), then drop it here.</span>
                </li>
                <li>
                  <strong>YouTube transcripts</strong>
                  <span className="uploader__guide-desc">Copy the transcript text into a .txt file and drop it here.</span>
                </li>
                <li>
                  <strong>Handwritten notes</strong>
                  <span className="uploader__guide-desc">Scan with a text-extraction tool and drop the .txt file.</span>
                </li>
              </ul>
            </div>

            <div className="uploader__import">
              <span className="terminal-label">RESTORE SESSION</span>
              <p className="uploader__import-text">
                Import a previous <span className="uploader__accent">.json</span> workspace to pick up where you left off.
              </p>
            </div>

            <div className="uploader__actions">
              <button className="uploader__btn uploader__btn--continue">
                Start Mapping
                <span className="uploader__btn-arrow">→</span>
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
