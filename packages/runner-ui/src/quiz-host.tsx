import { useEffect, useRef, useState } from "hono/jsx/dom";
import type { Quiz } from "@quiz-mcp/core";
import { extractIssues, type Issue, type ValidateQuizResult } from "@quiz-mcp/core/validation";
import { makeTranslator, type I18nDict } from "@quiz-mcp/ui/i18n";
import { formatIssue } from "./format-issue";

type ValidationErrorEntry = {
  questionId: string;
  title: string;
  messages: string[];
};

type QuizPlayerElement = HTMLElement & {
  quiz?: { questions: Array<{ id: string; title?: string }> };
  focusQuestion?: (qid: string) => void;
  i18n?: I18nDict;
};

const HOST_VARIANTS =
  ":host, :host:not([data-theme]), :host([data-theme=\"light\"]), :host([data-theme=\"dark\"])";

function buildShadowThemeSheet(vars: Record<string, string>): CSSStyleSheet | null {
  const entries = Object.entries(vars);
  if (entries.length === 0) return null;
  // DaisyUI 5 declares its defaults inside a named @layer (base), so unmarked
  // adopted-stylesheet rules lose the cascade. !important breaks the layer
  // boundary and ensures caller tokens win inside the shadow tree.
  const body = entries.map(([k, v]) => `${k}:${v} !important;`).join("");
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`${HOST_VARIANTS}{${body}}`);
  return sheet;
}

function readPayload<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el?.textContent) return fallback;
  try {
    return JSON.parse(el.textContent) as T;
  } catch (err) {
    console.warn(`[quiz-host] Failed to parse payload #${id}:`, err);
    return fallback;
  }
}

const i18nDict = readPayload<I18nDict>("quiz-i18n", {});
const themeVars = readPayload<Record<string, string>>("quiz-theme-vars", {});
const themeSheet = buildShadowThemeSheet(themeVars);
const t = makeTranslator(i18nDict);

export type QuizHostProps = {
  quizId: string;
  quiz: Quiz;
};

export const QuizHost = ({ quizId, quiz }: QuizHostProps) => {
  const playerRef = useRef<QuizPlayerElement | null>(null);
  const [errors, setErrors] = useState<ValidationErrorEntry[] | null>(null);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);

  const apiBase = window.location.pathname.replace(/\/+$/, "") || `/${quizId}`;

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let cancelled = false;
    (async () => {
      await customElements.whenDefined("quiz-player");
      if (cancelled) return;
      player.i18n = i18nDict;
      if (themeSheet) {
        const shadow = player.shadowRoot;
        if (shadow && !shadow.adoptedStyleSheets.includes(themeSheet)) {
          shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, themeSheet];
        }
      }
      setReady(true);
    })();

    const onAnswer = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setErrors(null);
      setFinished(false);
      fetch(`${apiBase}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detail),
      }).catch((err) => console.error("Failed to save answer:", err));
    };

    const onValidationError = (event: Event) => {
      const detail = (event as CustomEvent).detail as { report: ValidateQuizResult };
      const questions = player.quiz?.questions ?? [];
      const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
      const next = Object.entries(detail.report.byQuestion)
        .filter(([, res]) => !res.success)
        .map(([qid, res]) => {
          const issues = extractIssues(res);
          return {
            questionId: qid,
            title: byId[qid]?.title ?? qid,
            messages: issues.map((issue: Issue) => formatIssue(issue, t)),
          };
        });
      setErrors(next);
      setFinished(false);
    };

    const onFinish = (event: Event) => {
      const detail = (event as CustomEvent).detail as { answers: unknown };
      setErrors(null);
      setFinished(true);
      fetch(`${apiBase}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: detail.answers }),
      }).catch((err) => console.error("Failed to finish quiz:", err));
    };

    player.addEventListener("quiz-answer", onAnswer);
    player.addEventListener("quiz-validation-error", onValidationError);
    player.addEventListener("quiz-finish", onFinish);

    return () => {
      cancelled = true;
      player.removeEventListener("quiz-answer", onAnswer);
      player.removeEventListener("quiz-validation-error", onValidationError);
      player.removeEventListener("quiz-finish", onFinish);
    };
  }, [apiBase]);

  const focusQuestion = (qid: string) => {
    playerRef.current?.focusQuestion?.(qid);
  };

  if (finished) {
    return (
      <div class="card bg-base-200">
        <div class="card-body items-center text-center gap-6 py-12">
          <div class="flex h-14 w-14 items-center justify-center bg-primary text-primary-content">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="space-y-2">
            <h2 class="text-3xl font-bold tracking-tight">{t("complete.title")}</h2>
            <p class="text-base-content/70 max-w-md">
              {t("complete.text", { title: quiz.title })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasErrors = errors !== null && errors.length > 0;
  const errorCount = errors?.length ?? 0;
  const validationTextKey = errorCount === 1 ? "validation.text_one" : "validation.text_other";

  return (
    <>
            {hasErrors && (
        <div role="alert" class="alert alert-error items-start">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="flex-1 space-y-3">
            <div>
              <h3 class="font-bold">{t("validation.title")}</h3>
              <p class="text-sm opacity-80">
                {t(validationTextKey, { count: errorCount })}
              </p>
            </div>
            <ul class="space-y-1.5">
              {errors!.map((err) => (
                <li key={err.questionId} class="flex flex-wrap items-baseline gap-x-2">
                  <button type="button" class="link link-hover font-semibold" onClick={() => focusQuestion(err.questionId)}>
                    {err.title}
                  </button>
                  <span class="text-sm opacity-90">{err.messages.join("; ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <quiz-player
        data-theme="light"
        ref={playerRef}
        mode="cards"
        id="player"
        quiz={JSON.stringify(quiz)}
        style={ready ? undefined : "visibility: hidden"}
      />
    </>
  );
};
