import type { Quiz } from "@quiz-mcp/core";
import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
// Vite-emitted manifest from @quiz-mcp/runner-ui — resolved via package "exports".
// esbuild bundles .json imports inline at build time, so the worker bundle
// always carries the hashed asset filenames matching the latest UI build.
import manifest from "@quiz-mcp/runner-ui/manifest";

type ManifestEntry = { file: string; css?: string[] };
type Manifest = Record<string, ManifestEntry>;

const ENTRY_KEY = "src/main.tsx";

function resolveAssets(): { js: string; css: string } {
	const entry = (manifest as Manifest)[ENTRY_KEY];
	if (!entry) throw new Error(`runner-ui manifest missing entry "${ENTRY_KEY}"`);
	const css = entry.css?.[0];
	if (!css) throw new Error(`runner-ui manifest entry "${ENTRY_KEY}" has no CSS`);
	return { js: `/assets/${basename(entry.file)}`, css: `/assets/${basename(css)}` };
}

function basename(p: string): string {
	const i = p.lastIndexOf("/");
	return i === -1 ? p : p.slice(i + 1);
}

const Layout: FC<PropsWithChildren<{ title: string; cssHref: string }>> = ({
	title,
	cssHref,
	children,
}) => (
	<>
		{raw("<!doctype html>")}
		<html lang="en" data-theme="light">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{`Quiz — ${title}`}</title>
				<link rel="stylesheet" href={cssHref} />
			</head>
			<body class="min-h-screen bg-base-100 text-base-content antialiased">{children}</body>
		</html>
	</>
);

export function renderQuizDone(quiz: Quiz) {
	const assets = resolveAssets();
	return (
		<Layout title={quiz.title} cssHref={assets.css}>
			<main class="mx-auto w-full max-w-2xl px-6 py-16 md:py-20">
				<div class="card bg-base-200">
					<div class="card-body items-center text-center gap-6 py-12">
						<h2 class="text-3xl font-bold tracking-tight">Quiz already completed</h2>
						<p class="text-base-content/70 max-w-md">
							«{quiz.title}» has been finished and can no longer be retaken.
						</p>
					</div>
				</div>
			</main>
		</Layout>
	);
}

export function renderQuizShell(quiz: Quiz, quizId: string) {
	const assets = resolveAssets();
	const quizJson = JSON.stringify(quiz).replace(/</g, "\\u003c");
	return (
		<Layout title={quiz.title} cssHref={assets.css}>
			<main class="mx-auto w-full max-w-2xl px-6 py-16 md:py-20 space-y-12">
				<header>
					<h1 class="text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">
						{quiz.title}
					</h1>
					{quiz.description && (
						<p class="mt-4 text-base-content/60">{quiz.description}</p>
					)}
				</header>
				<section id="quiz-host" data-quiz-id={quizId} class="flex flex-col gap-6"></section>
				<script type="application/json" id="quiz-data">
					{raw(quizJson)}
				</script>
				<script type="application/json" id="quiz-i18n">
					{raw("{}")}
				</script>
				<script type="application/json" id="quiz-theme-vars">
					{raw("{}")}
				</script>
				<script type="module" src={assets.js}></script>
			</main>
		</Layout>
	);
}
