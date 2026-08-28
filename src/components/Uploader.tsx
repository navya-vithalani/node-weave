import { useCallback, useRef, useState } from 'react';
import type { OriginalStructure } from '../types/schema';
import '../styles/uploader-ext.css';

interface UploadedFile {
  id: string;
  name: string;
  type: 'txt' | 'md' | 'pdf';
  size: number;
  content?: string;
}

interface UploaderProps {
  onContinue: (data: {
    sessionName: string;
    files: UploadedFile[];
    importedSession: OriginalStructure | null;
  }) => void;
}

type Tab = 'upload' | 'restore';
type ExportType = 'original' | 'working' | null;

export default function Uploader({ onContinue }: UploaderProps) {
  const [tab, setTab] = useState<Tab>('upload');
  const [sessionName, setSessionName] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importedSession, setImportedSession] = useState<OriginalStructure | null>(null);
  const [exportType, setExportType] = useState<ExportType>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  /* ---- Clear errors on new selection ---- */

  const clearAllErrors = useCallback(() => {
    setUploadErrors([]);
    setValidationError(null);
  }, []);

  /* ---- File handlers ---- */

  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    clearAllErrors();
    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop()?.toLowerCase() as 'txt' | 'md' | 'pdf' | undefined;

      if (!ext || !['txt', 'md', 'pdf'].includes(ext)) {
        errors.push(file.name);
        continue;
      }

      let content: string | undefined;
      if (ext === 'txt' || ext === 'md') {
        content = await file.text();
      }

      newFiles.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: ext,
        size: file.size,
        content,
      });
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }

    if (errors.length > 0) {
      setUploadErrors(errors);
    }
  }, [clearAllErrors]);

  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleClearUploadErrors = useCallback(() => {
    setUploadErrors([]);
  }, []);

  /* ---- Import handlers ---- */

  const validateAndImport = useCallback(async (file: File) => {
    setIsValidating(true);
    setValidationError(null);
    setExportType(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as OriginalStructure;

      if (!data.sessionName || !Array.isArray(data.topics)) {
        setValidationError('Invalid session file. Missing sessionName or topics array.');
        return false;
      }

      // Determine export type
      const isWorking = 'modified' in data && data.modified === true && 'customInsights' in data;
      setExportType(isWorking ? 'working' : 'original');

      setSessionName(data.sessionName);
      setImportedSession(data);
      return true;
    } catch {
      setValidationError('Invalid session file. Could not parse JSON.');
      return false;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleClearImport = useCallback(() => {
    setImportedSession(null);
    setSessionName('');
    setValidationError(null);
    setExportType(null);
    // Reset file input for single-file cap
    if (restoreInputRef.current) {
      restoreInputRef.current.value = '';
    }
  }, []);

  const handleRestoreSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear previous import first (single-file cap)
    if (importedSession) {
      handleClearImport();
    }
    if (e.target.files && e.target.files.length > 0) {
      await validateAndImport(e.target.files[0]);
    }
  }, [validateAndImport, importedSession, handleClearImport]);

  /* ---- Drag & drop ---- */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  }, [handleFilesSelected]);

  /* ---- Continue ---- */

  const handleContinue = useCallback(() => {
    onContinue({ sessionName, files, importedSession });
  }, [onContinue, sessionName, files, importedSession]);

  const canContinue = tab === 'upload'
    ? files.length > 0
    : importedSession !== null;

  /* ---- Helpers ---- */

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /* ---- Render ---- */

  return (
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

        {/* ---- Tabs ---- */}
        <div className="uploader__tabs">
          <button
            className={`uploader__tab${tab === 'upload' ? ' uploader__tab--active' : ''}`}
            onClick={() => setTab('upload')}
          >
            Upload
          </button>
          <button
            className={`uploader__tab${tab === 'restore' ? ' uploader__tab--active' : ''}`}
            onClick={() => setTab('restore')}
          >
            Restore Session
          </button>
        </div>

        {tab === 'upload' ? (
          <>
            {/* ---- Upload: Description ---- */}
            <p className="uploader__tab-desc">
              Upload your source materials. We'll extract the ideas and map them into a knowledge graph.
            </p>

            {/* ---- Upload: Guide ---- */}
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

            {/* ---- Upload: Dropzone ---- */}
            <div className="uploader__dropzone"
              ref={dropzoneRef}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => uploadInputRef.current?.click()}
            >
              <input
                ref={uploadInputRef}
                id="uploader-file-input"
                type="file"
                accept=".txt,.md,.pdf"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div className="uploader__dropzone-content">
                <span className="uploader__dropzone-icon">▤</span>
                <p className="uploader__dropzone-text">
                  Drop files here &mdash; <span className="uploader__accent">.pdf</span>,{' '}
                  <span className="uploader__accent">.txt</span>,{' '}
                  <span className="uploader__accent">.md</span>
                </p>
                <p className="uploader__hint">or click to browse</p>
              </div>

              {files.length > 0 && (
                <div className="uploader__file-list">
                  {files.map(file => (
                    <div key={file.id} className="uploader__file-item">
                      <span className="uploader__file-icon">{file.type === 'pdf' ? '📄' : '📝'}</span>
                      <span className="uploader__file-name">{file.name}</span>
                      <span className="uploader__file-size">{formatFileSize(file.size)}</span>
                      <button
                        className="uploader__file-remove"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }}
                        title="Remove file"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Upload: Errors below dropzone ---- */}
            {uploadErrors.length > 0 && (
              <div className="uploader__upload-errors">
                <div className="uploader__upload-errors-header">
                  <span className="uploader__upload-errors-title">Unsupported files</span>
                  <button
                    className="uploader__upload-errors-dismiss"
                    onClick={handleClearUploadErrors}
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
                <ul className="uploader__upload-errors-list">
                  {uploadErrors.map((name, i) => (
                    <li key={i} className="uploader__upload-error-item">{name}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ---- Upload: Session name ---- */}
            <div className="uploader__session">
              <label className="uploader__session-label">
                <span className="terminal-label">SESSION NAME</span>
                <input
                  className="uploader__session-input"
                  type="text"
                  placeholder="Untitled Map"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            {/* ---- Restore: Description ---- */}
            <p className="uploader__tab-desc">
              Restore a previous workspace to pick up where you left off.
            </p>

            {/* ---- Restore: Guide ---- */}
            <div className="uploader__guide">
              <span className="terminal-label">SUPPORTED FORMATS</span>
              <ul className="uploader__guide-list">
                <li>
                  <strong>Original Export</strong>
                  <span className="uploader__guide-desc">AI-generated structure before any edits. Includes sessionName, createdAt, topics, and connections.</span>
                </li>
                <li>
                  <strong>Working Export</strong>
                  <span className="uploader__guide-desc">Edited workspace with customInsights and modified flags. Full edit history preserved.</span>
                </li>
              </ul>
            </div>

            {/* ---- Restore: Dropzone ---- */}
            <div
              className="uploader__dropzone"
              onDragOver={handleDragOver}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length > 0) {
                  if (importedSession) {
                    handleClearImport();
                  }
                  validateAndImport(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => document.getElementById('uploader-restore-input')?.click()}
            >
              <input
                id="uploader-restore-input"
                ref={restoreInputRef}
                type="file"
                accept=".json"
                onChange={handleRestoreSelect}
                style={{ display: 'none' }}
                disabled={importedSession !== null || isValidating}
              />
              <div className="uploader__dropzone-content">
                <span className="uploader__dropzone-icon">↓</span>
                <p className="uploader__dropzone-text">
                  Drop your <span className="uploader__accent">.json</span> session file here
                </p>
                <p className="uploader__hint">or click to browse</p>
              </div>
            </div>

            {/* ---- Restore: Imported session info ---- */}
            {importedSession && (
              <div className="uploader__imported">
                <div className="uploader__imported-info">
                  <span className="uploader__imported-name">{importedSession.sessionName}</span>
                  <span className="uploader__imported-meta">
                    {importedSession.topics.length} topics •{' '}
                    {new Date(importedSession.createdAt).toLocaleDateString()}
                    <span className="uploader__imported-badge">
                      {exportType === 'working' ? 'Working Export' : 'Original Export'}
                    </span>
                  </span>
                </div>
                <button
                  className="uploader__import-clear"
                  onClick={handleClearImport}
                  title="Clear import"
                >
                  ×
                </button>
              </div>
            )}
          </>
        )}

        {/* ---- Actions ---- */}
        <div className="uploader__actions">
          <button
            className="uploader__btn uploader__btn--continue"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Start Mapping
            <span className="uploader__btn-arrow">→</span>
          </button>
        </div>
      </div>
    </main>
  );
}