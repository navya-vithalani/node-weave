import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/boot-tutorial.css";

interface BootTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    eyebrow: "01 • BUILD THE FIRST MAP",
    title: "Let AI handle the first draft.",
    content:
      "Drop in PDFs, notes, articles or transcripts. NodeWeave extracts the important ideas and drafts an editable knowledge graph so you can start thinking instead of organizing.",
  },
  {
    eyebrow: "02 • EXPLORE & RESHAPE",
    title: "Your understanding comes first.",
    content:
      "Expand topics, rearrange nodes, connect ideas, and write your own insights. The graph evolves with your understanding—not the AI's.",
  },
  {
    eyebrow: "03 • PRIVATE BY DEFAULT",
    title: "Your workspace belongs to you.",
    content:
      "Everything stays inside your browser unless you deliberately ask the AI a question. Export your workspace whenever you want and keep complete ownership of your graph.",
  },
];

/*
  Animation phase lifecycle:

    entering ──→ corners ──→ reveal ──→ typing-title ──→ typing-content ──→ idle
       (initial load only — step changes restart at typing-title)
*/

type AnimPhase =
  | "entering"
  | "corners"
  | "reveal"
  | "typing-title"
  | "typing-content"
  | "idle";

const TYPING_MS = { title: 35, content: 14 };

export default function BootTutorial({
  onComplete,
  onSkip,
}: BootTutorialProps) {
  const [step, setStep] = useState(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("entering");
  const [typedTitleLen, setTypedTitleLen] = useState(0);
  const [typedContentLen, setTypedContentLen] = useState(0);

  const entryDone = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cornerTLRef = useRef<HTMLSpanElement>(null);
  const cornerTRRef = useRef<HTMLSpanElement>(null);
  const cornerBLRef = useRef<HTMLSpanElement>(null);
  const cornerBRRef = useRef<HTMLSpanElement>(null);

  const current = STEPS[step];

  /* ===========================================================
     ENTRY ANIMATION — runs once on mount
     =========================================================== */

  useEffect(() => {
    const cornerRefs = [
      cornerTLRef,
      cornerTRRef,
      cornerBLRef,
      cornerBRRef,
    ];

    // Stage 1: collapse all four corners to a single dot at modal centre
    const collapseToCentre = () => {
      const modal = modalRef.current;
      if (!modal) return;

      const mRect = modal.getBoundingClientRect();
      const cx = mRect.width / 2;
      const cy = mRect.height / 2;

      cornerRefs.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const elCx = r.left - mRect.left + r.width / 2;
        const elCy = r.top - mRect.top + r.height / 2;

        el.style.transition = "none";
        el.style.borderWidth = "0";
        el.style.borderColor = "transparent";
        el.style.width = "4px";
        el.style.height = "4px";
        el.style.borderRadius = "50%";
        el.style.background = "var(--accent)";
        el.style.opacity = "0";
        el.style.transform = `translate(${cx - elCx}px, ${cy - elCy}px)`;
      });
    };

    // Stage 2: spread dots to corners (no borders yet)
    const spreadToCorners = () => {
      requestAnimationFrame(() => {
        cornerRefs.forEach((ref) => {
          if (!ref.current) return;
          ref.current.style.transition =
            "transform 1.5s cubic-bezier(.22,.9,.2,1), opacity 0.4s ease";
          ref.current.style.transform = "translate(0, 0)";
          ref.current.style.opacity = "1";
        });
      });

      // Stage 3: morph dots into L-shaped corner brackets
      setTimeout(() => {
        cornerRefs.forEach((ref) => {
          if (!ref.current) return;
          ref.current.style.transition = "all 0.5s ease";
          ref.current.style.borderWidth = "1px";
          ref.current.style.borderColor = "rgba(255,255,255,.08)";
          ref.current.style.width = "18px";
          ref.current.style.height = "18px";
          ref.current.style.borderRadius = "0";
          ref.current.style.background = "transparent";
        });
        setAnimPhase("reveal");
      }, 1600);
    };

    collapseToCentre();
    const t = setTimeout(() => spreadToCorners(), 600);
    return () => clearTimeout(t);
  }, []);

  /* ── reveal → start typing ── */

  useEffect(() => {
    if (animPhase !== "reveal") return;
    const t = setTimeout(() => {
      entryDone.current = true;
      setAnimPhase("typing-title");
    }, 700);
    return () => clearTimeout(t);
  }, [animPhase]);

  /* ===========================================================
     TYPING — character-by-character
     =========================================================== */

  useEffect(() => {
    if (animPhase !== "typing-title") return;
    if (typedTitleLen >= current.title.length) {
      setAnimPhase("typing-content");
      return;
    }
    const t = setTimeout(
      () => setTypedTitleLen((l) => l + 1),
      TYPING_MS.title,
    );
    return () => clearTimeout(t);
  }, [animPhase, typedTitleLen, current.title]);

  useEffect(() => {
    if (animPhase !== "typing-content") return;
    if (typedContentLen >= current.content.length) {
      setAnimPhase("idle");
      return;
    }
    const t = setTimeout(
      () => setTypedContentLen((l) => l + 1),
      TYPING_MS.content,
    );
    return () => clearTimeout(t);
  }, [animPhase, typedContentLen, current.content]);

  /* ===========================================================
     STEP CHANGE — restart typing only
     =========================================================== */

  useEffect(() => {
    if (!entryDone.current) return;
    setAnimPhase("typing-title");
    setTypedTitleLen(0);
    setTypedContentLen(0);
  }, [step]);

  /* ===========================================================
     INTERACTION
     =========================================================== */

  const handleNext = useCallback(() => {
    if (step === STEPS.length - 1) {
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  }, [step, onComplete]);

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    nextRef.current?.focus();
  }, [step, animPhase]);

  /* ===========================================================
     DERIVED STATE
     =========================================================== */

  const isTyping =
    animPhase === "typing-title" || animPhase === "typing-content";
  const contentVisible =
    animPhase === "typing-content" || animPhase === "idle";
  const revealReady =
    animPhase !== "entering" && animPhase !== "corners";

  /* ===========================================================
     RENDER
     =========================================================== */

  return (
    <div className="boot-overlay">
      <div className="boot-modal" ref={modalRef}>
        {/* ---- decorative corners ---- */}
        <span className="boot-corner boot-corner--tl" ref={cornerTLRef} />
        <span className="boot-corner boot-corner--tr" ref={cornerTRRef} />
        <span className="boot-corner boot-corner--bl" ref={cornerBLRef} />
        <span className="boot-corner boot-corner--br" ref={cornerBRRef} />

        {/* ---------------- HEADER ---------------- */}
        <header className="boot-header">
          <div className="boot-brand">
            <span className="boot-brand__eyebrow">KNOWLEDGE WORKSTATION</span>
            <h1
              className={`boot-brand__title${
                isTyping ? " boot-brand__title--typing" : ""
              }`}
            >
              NodeWeave
            </h1>
            <p className="boot-brand__subtitle">
              AI drafts the first map.
              <br />
              You shape what it becomes.
            </p>
          </div>
          <pre className="boot-ascii">
{String.raw`
      ╭────────────╮
      │ ● ONLINE   │
      │ ◎ LOCAL    │
      │ ◇ READY    │
      ╰────────────╯
`}
          </pre>
        </header>

        {/* ---------------- STEP HEADER ---------------- */}
        <div
          className={`boot-modal__step-header ${
            revealReady ? "reveal-item--visible" : "reveal-item"
          }`}
          style={{ transitionDelay: revealReady ? "0s" : "0.1s" }}
        >
          <span className="boot-modal__step-num">
            {current.eyebrow}
          </span>
        </div>

        {/* ---------------- CONTENT ---------------- */}
        <div className="boot-modal__content">
          <div>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "2rem",
                marginBottom: "1rem",
                letterSpacing: "-0.04em",
                minHeight: "2.4rem",
              }}
            >
              {current.title.slice(0, typedTitleLen)}
              {animPhase === "typing-title" && <span className="typing-cursor" />}
            </h2>

            <p
              style={{
                minHeight: contentVisible ? "auto" : "3.2rem",
              }}
            >
              {contentVisible && current.content.slice(0, typedContentLen)}
              {(animPhase === "typing-content" || animPhase === "idle") && (
                <span className="typing-cursor" />
              )}
            </p>
          </div>
        </div>

        {/* ---------------- PROGRESS ---------------- */}
        <div
          className={`boot-modal__progress ${
            revealReady ? "reveal-item--visible" : "reveal-item"
          }`}
          style={{ transitionDelay: revealReady ? "0s" : "0.2s" }}
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`boot-modal__dot ${
                i <= step ? "boot-modal__dot--active" : ""
              }`}
            />
          ))}
        </div>

        {/* ---------------- FOOTER ---------------- */}
        <footer
          className={`boot-footer ${
            revealReady ? "reveal-item--visible" : "reveal-item"
          }`}
          style={{ transitionDelay: revealReady ? "0s" : "0.3s" }}
        >
          <div className="boot-footer__hint">
            STEP {step + 1} OF {STEPS.length}
          </div>

          <div className="boot-actions">
            <button
              className="boot-modal__btn boot-modal__btn--skip"
              onClick={onSkip}
            >
              Skip
            </button>

            <button
              ref={nextRef}
              className="boot-modal__btn boot-modal__btn--next"
              onClick={handleNext}
            >
              {step === STEPS.length - 1 ? "Enter Workspace" : "Continue"}

              <span className="boot-modal__btn-arrow">
                →
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
