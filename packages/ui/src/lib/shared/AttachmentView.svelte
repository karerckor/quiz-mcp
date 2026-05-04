<script lang="ts">
  import type { Attachment } from '@quiz-mcp/core';
  import hljs from 'highlight.js/lib/common';
  import hljsTheme from 'highlight.js/styles/github-dark.css?inline';

  interface Props {
    attachment: Attachment;
  }

  let { attachment }: Props = $props();

  // Mockup-code already paints the surface and top dots. The hljs theme makes
  // `code.hljs` a block element, which collides with daisyUI's `pre::before`
  // gutter trick (it ends up on its own line, leaving the code flush-left).
  // Suppress the gutter and apply explicit horizontal padding on the <pre>.
  const hljsOverrides =
    '.mockup-code pre{padding-inline:1.25rem !important;}' +
    '.mockup-code pre::before{display:none !important;}' +
    '.mockup-code .hljs{background:transparent !important;padding:0 !important;}';
  const hljsStyles = hljsTheme + '\n' + hljsOverrides;

  function highlightCode(code: string, language: string): string {
    const lang = language?.toLowerCase();
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  }
</script>

{#if attachment.type === 'image'}
  <img
    src={attachment.url}
    alt={attachment.alt ?? ''}
    class="h-auto w-full max-h-[70svh] rounded-box border border-base-300 bg-base-200 object-contain"
  />
{:else if attachment.type === 'video'}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    controls
    src={attachment.url}
    class="h-auto w-full max-h-[70svh] rounded-box border border-base-300"
  ></video>
{:else if attachment.type === 'audio'}
  <audio controls src={attachment.url} class="w-full"></audio>
{:else if attachment.type === 'file'}
  <a
    href={attachment.url}
    target="_blank"
    rel="noopener noreferrer"
    class="link link-primary inline-flex items-center gap-2"
  >
    <span aria-hidden="true">📎</span>
    <span>{attachment.alt ?? attachment.url}</span>
  </a>
{:else if attachment.type === 'code'}
  {@html `<style>${hljsStyles}</style>`}
  <div class="mockup-code text-sm">
    <pre><code
        class="hljs language-{attachment.language}">{@html highlightCode(attachment.code, attachment.language)}</code></pre>
  </div>
{/if}
