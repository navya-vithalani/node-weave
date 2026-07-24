import { useState, useRef, useEffect, useCallback } from 'react';
import '../styles/boot-tutorial.css';

/* ---------------------------------------------------------------
   Boot-up Tutorial — Phase 1
   Design.md §2 — Phase 1: Boot-up tutorial modal

   Three-step modal that orients first-time users. Accessible via
   keyboard (Escape to skip, Tab through controls, Enter to
   advance) and screen-reader friendly (role="dialog", aria-modal,
   aria-label).
   --------------------------------------------------------------- */

interface BootTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    title: 'SYSTEM DEFINITION',
    content:
      'This platform converts raw unstructured document packets into interactive visual knowledge graphs combined with localized RAG context engines.',
  },
  {
    title: 'MECHANICS',
    content:
      'Double-click to expand nodes. Toggle to collapse subtopics. Drag lines manually to create custom relations.',
  },
  {
    title: 'DATA SECURITY',
    content:
      "Zero databases used. Your data is stored locally in your browser's RAM. Remember to export your workspace before terminating your browser session. Note: when you ask a question, your source material and query are sent to the AI provider to generate an answer — nothing is stored on our end or tied to an account.",
  },
] as const;

export default function BootTutorial({ onComplete, onSkip }: BootTutorialProps) {
  const [step, setStep] = useState(0);
  const [animateKey, setAnimateKey] = useState(0);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step];

  /* ---- Focus the next button on mount and after each step change ---- */
  useEffect(() => {
    const t = setTimeout(() => nextBtnRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [step]);

  /* ---- Global Escape key: skip the tutorial ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSkip]);

  /* ---- Advance to the next step or complete ---- */
  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      setAnimateKey((k) => k + 1);
      setStep((s) => s + 1);
    }
  }, [isLastStep, onComplete]);

  return (
    <div
      className="boot-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="NodeWeave tutorial — 3 steps"
      onKeyDown={(e) => {
        // Prevent Escape from bubbling to document handler
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      <div className="boot-modal">
        {/* ---- Step header ---- */}
        <div className="boot-modal__step-header">
          <span className="boot-modal__step-num">Step {step + 1}</span>
          <span className="boot-modal__step-sep"> // </span>
          <span className="boot-modal__step-title">{current.title}</span>
        </div>

        {/* ---- Content (key-swapped for fade animation) ---- */}
        <div className="boot-modal__content" key={animateKey}>
          <p>{current.content}</p>
        </div>

        {/* ---- Progress dots ---- */}
        <div className="boot-modal__progress" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`boot-modal__dot ${i === step ? 'boot-modal__dot--active' : ''}`}
            />
          ))}
        </div>

        {/* ---- Controls ---- */}
        <div className="boot-modal__controls">
          <button
            onClick={onSkip}
            className="boot-modal__btn boot-modal__btn--skip"
            aria-label="Skip tutorial"
            type="button"
          >
            SKIP_TUTORIAL
          </button>
          <button
            ref={nextBtnRef}
            onClick={handleNext}
            className="boot-modal__btn boot-modal__btn--next"
            aria-label={isLastStep ? 'Complete tutorial' : 'Next step'}
            type="button"
          >
            {isLastStep ? '[ COMPLETE ]' : '[ NEXT_STEP > ]'}
          </button>
        </div>
      </div>
    </div>
  );
}
