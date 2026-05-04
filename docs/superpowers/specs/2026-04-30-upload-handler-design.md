# Upload handler contract for `Player` / `<quiz-player>`

**Date:** 2026-04-30
**Status:** Approved (design phase)
**Scope:** Contract-only — `@quiz-mcp/ui` and `@quiz-mcp/web-components`. Runner endpoint and `quiz-host.tsx` wiring are out of scope and tracked separately.

## Problem

`packages/ui/src/lib/questions/Upload.svelte` renders a file input and accepts an optional `uploadFile?: (file: File) => Promise<UploadedFile>` prop. When the prop is omitted (which is true for every consumer in this repository today, including the `<quiz-player>` web component used by `runner-ui`), the component falls back to `URL.createObjectURL(file)` — a local blob URL that is never persisted anywhere. Visually the control accepts the file; in reality nothing leaves the browser.

The function-prop shape compounds the problem for the `<quiz-player>` custom element: functions cannot be passed through HTML attributes, so consumers that drop the element into a server-rendered page (the primary integration mode, see `packages/runner-ui/src/quiz-host.tsx`) have no ergonomic way to wire upload behaviour.

## Goals

1. Make the upload contract usable from the `<quiz-player>` web component via plain HTML attributes for the common case (POST to a backend endpoint).
2. Keep an escape hatch for advanced cases (auth headers, presigned S3 PUT, custom serialisation).
3. Keep the local blob-URL fallback so demos and local development continue to work without a server.

## Non-goals

- Adding an upload endpoint to `apps/runner`.
- Wiring the new prop in `packages/runner-ui/src/quiz-host.tsx`.
- Tests for `Upload.svelte` (no test scaffolding exists for the file today; adding it inflates this task).
- Backwards-compatibility shim for the existing `uploadFile` prop (no consumers found via grep).

## Design

### Prop contract

`Upload.svelte`, `QuestionRenderer.svelte`, and `Player.svelte` accept the same two new optional props and drop the existing `uploadFile`:

```ts
interface UploadProps {
  uploadUrl?: string;
  onUpload?: (file: File) => Promise<string>;
}
```

Both forms return only a URL string. `Upload.svelte` constructs the `UploadedFile` answer payload from the local `File` object:

```ts
{
  url,
  name: file.name,
  mimeType: file.type || 'application/octet-stream',
  sizeBytes: file.size,
}
```

The server is not required to return `name`, `mimeType`, or `sizeBytes`.

### Resolution order

```
function resolveUrl(file: File): Promise<string> {
  if (onUpload)  return onUpload(file);
  if (uploadUrl) return postMultipart(uploadUrl, file);
  return Promise.resolve(URL.createObjectURL(file)); // existing fallback
}
```

If both `onUpload` and `uploadUrl` are passed, `onUpload` wins and `uploadUrl` is ignored silently — symmetric with how `externalAnswers` overrides `internalAnswers` in `Player.svelte:42`. No dev warning.

### Network contract for `uploadUrl`

- `POST <uploadUrl>` with `multipart/form-data`.
- Single field `file` containing the binary.
- One HTTP request per file. Batches of files are uploaded in parallel via `Promise.all`, preserving today's behaviour at `Upload.svelte:75`.
- No custom headers or credentials. Anything more specific belongs in `onUpload`.

### Response envelope

```ts
type UploadResponse =
  | { ok: true;  fileUrl: string }
  | { ok: false; error: string };
```

Error mapping (all paths surface a single message in the existing `err` alert):

| Condition                                       | Message                                       |
| ----------------------------------------------- | --------------------------------------------- |
| `response.ok` is `false` and body has `error`   | `error` from body                             |
| Body parses to `{ ok: false, error }`           | `error` from body                             |
| Network failure / non-JSON body / parse error   | `t('question.upload.upload_failed')`          |

A failure on any single file aborts the surrounding `Promise.all`, matching current behaviour. Per-file partial-success handling is out of scope.

### Web component registration

`packages/web-components/src/QuizPlayer.svelte` `<svelte:options>` block:

```svelte
<svelte:options customElement={{
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
}} />
```

- `upload-url` → camelCase property `uploadUrl`. Settable as HTML attribute or JS property.
- `onUpload` is registered as a regular reactive prop. Svelte's custom-element runtime exposes it under both an `on-upload` attribute and a `.onUpload` property, but only the property is meaningful — function values do not survive attribute stringification. This is the same pattern already used today for `quiz`, `answers`, and `i18n`.
- The old `uploadFile` entry is removed.

The component template forwards both props into the inner `<Player>`:

```svelte
<Player … {uploadUrl} {onUpload} />
```

### Documentation

`packages/web-components/README.md` table replaces the single `uploadFile` row with two rows for `uploadUrl` and `onUpload`, plus a short note describing the response envelope (`{ ok: true, fileUrl } | { ok: false, error }`) and that `onUpload` must be set as a property.

## Files touched

| File                                                                     | Change                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `packages/ui/src/lib/questions/Upload.svelte`                            | Replace `uploadFile` with `uploadUrl` + `onUpload`. Add `postMultipart` helper inline. Update `onPick` to call `resolveUrl(file)`. |
| `packages/ui/src/lib/QuestionRenderer.svelte`                            | Replace prop and forward to `Upload`.                                 |
| `packages/ui/src/lib/Player.svelte`                                      | Replace prop and forward to `QuestionRenderer` (in both `full` and `cards` branches). |
| `packages/web-components/src/QuizPlayer.svelte`                          | Update `<svelte:options>` props, swap `uploadFile` in the `<Player>` invocation, drop `UploadedFile` import if unused. |
| `packages/web-components/README.md`                                      | Update prop table and add response-envelope note.                     |

## Open questions

None. All design points were resolved during brainstorming.

## Out of scope (follow-up tasks)

1. Add a `POST /:quizId/upload` handler to `apps/runner` and persist files locally (KV / disk) so the runner UI can demonstrate end-to-end uploads.
2. Pass `upload-url` from `quiz-host.tsx` to the `<quiz-player>` element so the runner-served quizzes use real uploads.
3. Add component-level tests for `Upload.svelte` covering: success, server-`ok:false`, HTTP-error, network-error, blob-URL fallback when neither prop is set, and `onUpload` precedence.
