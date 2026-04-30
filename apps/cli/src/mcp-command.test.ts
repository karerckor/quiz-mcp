import { afterEach, describe, expect, it } from "vitest";
import type { QuizDefinition } from "@quiz-mcp/core";
import { createInMemoryQuizService } from "@quiz-mcp/runner-api/in-memory";
import { createRunnerServer } from "@quiz-mcp/runner-api/server";
import { HostedService } from "./hosted-service.js";
import { RunnerHost } from "./runner-host.js";

const TEST_DEFINITION: QuizDefinition = {
  title: "Integration",
  questions: [],
};

describe("mcp-command integration: HostedService + RunnerHost + createRunnerServer", () => {
  let host: RunnerHost;

  afterEach(async () => {
    if (host && host.isRunning()) await host.stop();
  });

  it("registers a quiz via HostedService, serves it over HTTP, auto-stops when finished+read", async () => {
    const inner = createInMemoryQuizService([]);
    host = new RunnerHost(() => createRunnerServer({ service: inner }));
    const hosted = new HostedService(inner, host);

    const quiz = await hosted.registerQuiz(TEST_DEFINITION);
    expect(host.isRunning()).toBe(true);
    expect(quiz.id).toBeDefined();

    const quizRes = await fetch(`${host.url}/${quiz.id}/quiz.json`);
    expect(quizRes.status).toBe(200);
    expect(await quizRes.json()).toEqual(quiz);

    const finishRes = await fetch(`${host.url}/${quiz.id}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: {} }),
    });
    expect(finishRes.status).toBe(204);

    const state = await hosted.getState(quiz.id);
    expect(state.finished).toBe(true);

    // Auto-stop is fire-and-forget; give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(host.isRunning()).toBe(false);
  });
});
