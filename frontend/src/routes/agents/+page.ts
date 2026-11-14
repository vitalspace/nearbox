// `/agents` is static documentation, so it is prerendered to real HTML.
// Crawlers and AI agents that do not execute JavaScript still get the full text.
export const ssr = true;
export const prerender = true;