import { describe, expect, it } from "vitest";
import type { Quiz } from "@quiz-mcp/core";
import { QuizNotFoundError, type QuizService } from "../service.js";
import { createRunnerServer } from "./index.js";

const MINI_QUIZ: Quiz = {
  id: "mini",
  title: "Mini",
  questions: [],
};

function inMemoryService(): QuizService {
  return {
    async registerQuiz(definition) {
      return { ...definition, id: "generated" };
    },
    async quizExists(id) { return id === MINI_QUIZ.id; },
    async getQuiz(id) {
      if (id !== MINI_QUIZ.id) throw new QuizNotFoundError(id);
      return MINI_QUIZ;
    },
    async saveAnswer() {},
    async finishQuiz() {},
    async getState() { return { finished: false, answers: {} }; },
  };
}

describe("createRunnerServer", () => {
  it("GET / redirects to defaultQuizId when set", async () => {
    const app = createRunnerServer({
      service: inMemoryService(),
      config: { defaultQuizId: "mini" },
    });
    const res = await app.request("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/mini");
  });

  it("GET / 404s when no defaultQuizId", async () => {
    const app = createRunnerServer({ service: inMemoryService() });
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });

  it("GET /:unknown returns 404", async () => {
    const app = createRunnerServer({ service: inMemoryService() });
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
  });

  it("GET /:id returns HTML with required payload scripts", async () => {
    const app = createRunnerServer({ service: inMemoryService() });
    const res = await app.request("/mini");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('id="quiz-data"');
    expect(body).toContain('id="quiz-i18n"');
    expect(body).toContain('id="quiz-theme-vars"');
    expect(body).toContain('data-quiz-id="mini"');
  });

  it("applies DEFAULT_THEME when no theme option is passed", async () => {
    const app = createRunnerServer({ service: inMemoryService() });
    const body = await (await app.request("/mini")).text();
    expect(body).toContain('id="quiz-theme"');
    expect(body).toContain("--color-primary:oklch(79% 0.184 86.047)");
  });

  it("omits <style id=\"quiz-theme\"> when theme is explicitly empty", async () => {
    const app = createRunnerServer({ service: inMemoryService(), theme: {} });
    const body = await (await app.request("/mini")).text();
    expect(body).not.toContain('id="quiz-theme"');
  });

  it("caller theme overrides DEFAULT_THEME tokens", async () => {
    const app = createRunnerServer({
      service: inMemoryService(),
      theme: { primary: "#0af" },
    });
    const body = await (await app.request("/mini")).text();
    expect(body).toContain('id="quiz-theme"');
    expect(body).toContain("--color-primary:#0af");
    // Non-overridden base100 stays at DEFAULT_THEME value? Only if caller
    // spread DEFAULT_THEME; here they didn't, so base100 is not emitted.
    expect(body).not.toContain("--color-base-100");
  });

  it("payload #quiz-i18n contains only caller overrides, not defaults", async () => {
    const app = createRunnerServer({
      service: inMemoryService(),
      i18n: { "button.back": "Назад" },
    });
    const body = await (await app.request("/mini")).text();
    const match = body.match(/<script type="application\/json" id="quiz-i18n">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed).toEqual({ "button.back": "Назад" });
  });

  it("delegates /:id/answer to createRunnerApi", async () => {
    const calls: unknown[] = [];
    const service: QuizService = {
      ...inMemoryService(),
      async saveAnswer(quizId, answer) { calls.push({ quizId, answer }); },
    };
    const app = createRunnerServer({ service });
    const res = await app.request("/mini/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: "q1", kind: "short_text", text: "hi" }),
    });
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
  });
});
