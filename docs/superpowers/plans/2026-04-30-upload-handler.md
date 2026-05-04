# Upload Handler Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `uploadFile?: (file: File) => Promise<UploadedFile>` prop on `Player` / `<quiz-player>` with a hybrid contract: `uploadUrl?: string` (POST multipart, attribute-friendly for the web component) and `onUpload?: (file: File) => Promise<string>` (escape hatch). The local blob-URL fallback is preserved when neither prop is set.

**Architecture:** Three layers in `@quiz-mcp/ui` (`Upload.svelte` → `QuestionRenderer.svelte` → `Player.svelte`) carry the same two new props. `Upload.svelte` owns the network behaviour: it picks `onUpload` over `uploadUrl` over the blob fallback, posts files as `multipart/form-data` (field `file`), and validates the `{ ok, fileUrl } | { ok, error }` response envelope. `<quiz-player>` registers `upload-url` as an HTML attribute and `onUpload` as a property. **No tests in scope** (per spec §7); verification is `typecheck` + `build`.

**Tech Stack:** Svelte 5 runes, TypeScript, pnpm workspaces, svelte-check, Vite, Turborepo.

**Spec:** `docs/superpowers/specs/2026-04-30-upload-handler-design.md`

---

## File structure

| File                                                     | Status   | Responsibility |
| -------------------------------------------------------- | -------- | -------------- |
| `packages/ui/src/lib/questions/Upload.svelte`            | modified | Renders the file input; owns `resolveUrl` / `postMultipart`; constructs `UploadedFile` from the local `File`. |
| `packages/ui/src/lib/QuestionRenderer.svelte`            | modified | Forwards `uploadUrl` / `onUpload` to `Upload` for `_kind === 'upload'`. |
| `packages/ui/src/lib/Player.svelte`                      | modified | Accepts the props at the top level and forwards to `QuestionRenderer` in both render branches. |
| `packages/web-components/src/QuizPlayer.svelte`          | modified | Registers `upload-url` (string attr) and `onUpload` (property) on the custom element; forwards into `<Player>`. |
| `packages/web-components/README.md`                      | modified | Updates the prop table and gotchas section. |

---

## Task 1: Replace `uploadFile` with `uploadUrl` + `onUpload` in `@quiz-mcp/ui`

**Files:**
- Modify: `packages/ui/src/lib/questions/Upload.svelte`
- Modify: `packages/ui/src/lib/QuestionRenderer.svelte`
- Modify: `packages/ui/src/lib/Player.svelte`

The three files are coupled — the parent's prop name must match the child's. Edit them together so the workspace stays type-safe between commits.

- [ ] **Step 1: Update `Upload.svelte` props and add network helpers**

In `packages/ui/src/lib/questions/Upload.svelte`:

Replace the `Props` interface (currently lines 10–20) and the destructure (line 22) with:

```svelte
  interface Props {
    question: UploadQuestion;
    value?: UploadAnswer;
    disabled?: boolean;
    onChange: (answer: UploadAnswer) => void;
    uploadUrl?: string;
    onUpload?: (file: File) => Promise<string>;
  }

  let {
    question,
    value,
    disabled = false,
    onChange,
    uploadUrl,
    onUpload,
  }: Props = $props();
```

Keep the `UploadedFile` import — it is still used as the return type of the inner `take.map` callback.

Insert these helpers immediately after `humanSize` (i.e. after line 48, before `async function onPick`):

```svelte
  type UploadResponse =
    | { ok: true; fileUrl: string }
    | { ok: false; error: string };

  async function resolveUrl(file: File): Promise<string> {
    if (onUpload) return onUpload(file);
    if (uploadUrl) return postMultipart(uploadUrl, file);
    return URL.createObjectURL(file);
  }

  async function postMultipart(url: string, file: File): Promise<string> {
    const fallback = t('question.upload.upload_failed');
    const form = new FormData();
    form.append('file', file);

    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', body: form });
    } catch {
      throw new Error(fallback);
    }

    const body = (await res.json().catch(() => null)) as UploadResponse | null;

    if (body && body.ok === false) throw new Error(body.error);
    if (!res.ok) throw new Error(fallback);
    if (body && body.ok === true) return body.fileUrl;
    throw new Error(fallback);
  }
```

Replace the inner `take.map` body inside `onPick` (currently lines 75–85) — the block that reads `if (uploadFile) return await uploadFile(f); return { url: URL.createObjectURL(f), ... };` — with this version that delegates to `resolveUrl`:

```svelte
      const uploaded = await Promise.all(
        take.map(async (f): Promise<UploadedFile> => {
          const url = await resolveUrl(f);
          return {
            url,
            name: f.name,
            mimeType: f.type || 'application/octet-stream',
            sizeBytes: f.size,
          };
        }),
      );
```

The surrounding `try { ... } catch (e) { err = e instanceof Error ? e.message : ...; }` (lines 73–95) stays unchanged — the new helpers throw `Error` instances whose `.message` is already an i18n string.

- [ ] **Step 2: Update `QuestionRenderer.svelte`**

In `packages/ui/src/lib/QuestionRenderer.svelte`:

Change the import on line 2 from:

```svelte
  import type { Question, Answer, UploadedFile } from '@quiz-mcp/core';
```

to:

```svelte
  import type { Question, Answer } from '@quiz-mcp/core';
```

Replace the `Props` interface (lines 14–20) and the destructure (line 22) with:

```svelte
  interface Props {
    question: Question;
    value?: Answer;
    disabled?: boolean;
    onChange: (answer: Answer) => void;
    uploadUrl?: string;
    onUpload?: (file: File) => Promise<string>;
  }

  let {
    question,
    value,
    disabled = false,
    onChange,
    uploadUrl,
    onUpload,
  }: Props = $props();
```

Replace the `<Upload …>` block (currently lines 89–95) with:

```svelte
{:else if question._kind === 'upload'}
  <Upload
    {question}
    value={value?._kind === 'upload' ? value : undefined}
    {disabled}
    {onChange}
    {uploadUrl}
    {onUpload}
  />
```

- [ ] **Step 3: Update `Player.svelte`**

In `packages/ui/src/lib/Player.svelte`:

Change the import on line 3 from:

```svelte
  import type { Quiz, Answer, UploadedFile } from '@quiz-mcp/core';
```

to:

```svelte
  import type { Quiz, Answer } from '@quiz-mcp/core';
```

Replace the `Props` interface (lines 15–25) with:

```svelte
  interface Props {
    quiz: Quiz;
    mode?: Mode;
    answers?: Record<string, Answer>;
    uploadUrl?: string;
    onUpload?: (file: File) => Promise<string>;
    onAnswer: (answer: Answer) => void;
    onFinish: (answers: Record<string, Answer>) => void;
    prev?: Snippet<[NavSnippetProps]>;
    next?: Snippet<[NavSnippetProps]>;
    complete?: Snippet<[NavSnippetProps]>;
  }
```

Replace the destructure (lines 27–37) with:

```svelte
  let {
    quiz,
    mode = 'full',
    answers: externalAnswers,
    uploadUrl,
    onUpload,
    onAnswer,
    onFinish,
    prev,
    next,
    complete,
  }: Props = $props();
```

In both `<QuestionRenderer …>` invocations (currently `{uploadFile}` on line 101 in the `mode === 'full'` branch and on line 128 in the `cards` branch), replace:

```svelte
          {uploadFile}
```

with:

```svelte
          {uploadUrl}
          {onUpload}
```

- [ ] **Step 4: Run typecheck for `@quiz-mcp/ui`**

Run: `pnpm --filter @quiz-mcp/ui typecheck`

Expected: exits 0, no TypeScript diagnostics. If `tsc` complains about a missing reference to `uploadFile` anywhere else, grep for stragglers:

```bash
git -C /Users/igor/Projects/Personal/quiz-mcp grep -nF 'uploadFile' -- 'packages/ui/**'
```

Should return zero matches after this task.

- [ ] **Step 5: Commit**

```bash
git -C /Users/igor/Projects/Personal/quiz-mcp add packages/ui/src/lib/questions/Upload.svelte packages/ui/src/lib/QuestionRenderer.svelte packages/ui/src/lib/Player.svelte
git -C /Users/igor/Projects/Personal/quiz-mcp commit -m "feat(ui): replace uploadFile with uploadUrl + onUpload in Player

Player, QuestionRenderer, and Upload now accept uploadUrl (POST
multipart) and onUpload (callback returning a URL string) instead of
the previous uploadFile callback. Upload.svelte owns the
{ ok, fileUrl } | { ok, error } envelope. The local blob-URL fallback
is preserved when neither prop is set; onUpload wins when both are
passed."
```

---

## Task 2: Wire the new props into `<quiz-player>` and update docs

**Files:**
- Modify: `packages/web-components/src/QuizPlayer.svelte`
- Modify: `packages/web-components/README.md`

- [ ] **Step 1: Update `<svelte:options>` registration**

In `packages/web-components/src/QuizPlayer.svelte`, replace the `<svelte:options>` block at lines 1–12 with:

```svelte
<svelte:options
  customElement={{
    tag: 'quiz-player',
    shadow: 'open',
    props: {
      quiz: { type: 'Object' },
      mode: { type: 'String' },
      answers: { type: 'Object' },
      i18n: { type: 'Object' },
      uploadUrl: { type: 'String', attribute: 'upload-url' },
      onUpload: { type: 'Object' },
    },
  }}
/>
```

- [ ] **Step 2: Update imports, `Props` interface, destructure, and inner `<Player>` invocation**

Still in `packages/web-components/src/QuizPlayer.svelte`:

Change line 15 from:

```svelte
  import type { Answer, Quiz, UploadedFile } from '@quiz-mcp/core';
```

to:

```svelte
  import type { Answer, Quiz } from '@quiz-mcp/core';
```

Replace the `Props` interface (lines 28–34) with:

```svelte
  interface Props {
    quiz: Quiz;
    mode?: Mode;
    answers?: Record<string, Answer>;
    uploadUrl?: string;
    onUpload?: (file: File) => Promise<string>;
    i18n?: I18nDict;
  }
```

Replace the destructure (lines 36–42) with:

```svelte
  let {
    quiz,
    mode = 'full',
    answers,
    uploadUrl,
    onUpload,
    i18n,
  }: Props = $props();
```

In the `<Player … />` element at the bottom (lines 183–194), replace:

```svelte
  {uploadFile}
```

(currently line 188) with:

```svelte
  {uploadUrl}
  {onUpload}
```

- [ ] **Step 3: Run typecheck for `@quiz-mcp/web-components`**

Run: `pnpm --filter @quiz-mcp/web-components typecheck`

Expected: `svelte-check` reports `0 errors, 0 warnings`. Confirm with grep that no stale `uploadFile` references remain:

```bash
git -C /Users/igor/Projects/Personal/quiz-mcp grep -nF 'uploadFile' -- 'packages/web-components/src/**'
```

Should return zero matches.

- [ ] **Step 4: Build `@quiz-mcp/web-components`**

Run: `pnpm --filter @quiz-mcp/web-components build`

Expected: Vite emits `dist/quiz-mcp-web-components.mjs`, `dist/quiz-mcp-web-components.iife.js`, and `dist/index.d.ts` without errors.

- [ ] **Step 5: Update `packages/web-components/README.md`**

In the property table (around lines 80–86), replace the `uploadFile` row:

```
| `uploadFile` | `(file: File) => Promise<UploadedFile>`     | no       | —        | Hook for `file` questions. Must return an `UploadedFile`. Setting this only works as a property. |
```

with two new rows:

```
| `uploadUrl`  | `string`                                    | no       | —        | Endpoint for `upload` questions. The player POSTs each file as `multipart/form-data` (field name `file`) to this URL. The server must respond with `{ ok: true, fileUrl: string }` on success or `{ ok: false, error: string }` on failure. Settable via the `upload-url` HTML attribute or as a property. |
| `onUpload`   | `(file: File) => Promise<string>`           | no       | —        | Escape hatch for `upload` questions. Resolves to the uploaded file's URL. Use when you need custom headers (auth), presigned S3 PUTs, or non-multipart serialisation. Property-only — functions cannot be passed via attributes. If both `uploadUrl` and `onUpload` are set, `onUpload` wins. |
```

In the import-types snippet directly below the table (around line 91), drop `UploadedFile` from the import — it is no longer part of the public API surface. Replace:

```ts
import type { Answer, Quiz, UploadedFile } from "@quiz-mcp/core";
import type { I18nDict } from "@quiz-mcp/ui/i18n";
```

with:

```ts
import type { Answer, Quiz } from "@quiz-mcp/core";
import type { I18nDict } from "@quiz-mcp/ui/i18n";
```

In the **Gotchas** section near the end of the file, replace the bullet:

```
- **Complex props must be set as properties, not attributes.** `quiz`, `answers`, `i18n`, and `uploadFile` are non-string values. Setting them via HTML attributes will either fail silently or coerce to `"[object Object]"`.
```

with:

```
- **Complex props must be set as properties, not attributes.** `quiz`, `answers`, `i18n`, and `onUpload` are non-string values. Setting them via HTML attributes will either fail silently or coerce to `"[object Object]"`. `uploadUrl` is a plain string and works fine as the `upload-url` attribute.
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/igor/Projects/Personal/quiz-mcp add packages/web-components/src/QuizPlayer.svelte packages/web-components/README.md
git -C /Users/igor/Projects/Personal/quiz-mcp commit -m "feat(web-components): expose upload-url + onUpload on <quiz-player>

Registers the new uploadUrl prop as the upload-url HTML attribute and
onUpload as a property-only function. Removes the old uploadFile prop.
README updated with the new prop table, response-envelope description,
and gotcha note about which props must still be set as properties."
```

---

## Task 3: Final cross-workspace check

**Files:** none

- [ ] **Step 1: Workspace-wide typecheck and build**

Run: `pnpm typecheck && pnpm build`

Expected: turbo runs `typecheck` and `build` across all packages and apps; both pipelines exit 0. This catches any consumer of `Player` outside the touched files (the spec asserts there are none, but turbo confirms it).

- [ ] **Step 2: Final stale-reference scan**

Run:

```bash
git -C /Users/igor/Projects/Personal/quiz-mcp grep -nF 'uploadFile' -- ':!docs' ':!**/dist/**' ':!**/node_modules/**'
```

Expected: zero matches. (The string may legitimately remain in `docs/superpowers/specs/2026-04-30-upload-handler-design.md` as historical context — that's why `:!docs` is excluded.)

If anything turns up, treat it as a missed call site and fix it before finishing.

---

## Self-review

**Spec coverage:**
- Spec §1 (scope: contract only) → all five files in §2 of the spec are touched in Task 1 + Task 2. Runner endpoint and `quiz-host.tsx` are correctly absent.
- Spec §2 (prop contract) → Task 1 Steps 1–3 add `uploadUrl` + `onUpload` to all three layers and remove `uploadFile`.
- Spec §3 (resolution order, blob fallback) → Task 1 Step 1 inlines `resolveUrl` with the `onUpload → uploadUrl → URL.createObjectURL` precedence.
- Spec §4 (multipart, response envelope, error mapping) → Task 1 Step 1's `postMultipart` matches the table row-for-row.
- Spec §5 (web-component registration) → Task 2 Steps 1–2.
- Spec §6 (docs) → Task 2 Step 5.
- Spec §7 (no tests) → respected; verification uses typecheck + build instead.

**Placeholder scan:** none of "TBD/TODO/implement later/handle edge cases/similar to Task N" appear. All code blocks are concrete.

**Type consistency:** `uploadUrl: string`, `onUpload: (file: File) => Promise<string>`, and `UploadResponse = { ok: true; fileUrl: string } | { ok: false; error: string }` are spelled identically in every task that mentions them. Function names — `resolveUrl`, `postMultipart` — are referenced consistently.
