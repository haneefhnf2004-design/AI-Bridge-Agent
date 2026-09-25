/**
 * platforms.js — AI Bridge Agent platform registry (additive, no existing logic touched)
 * The 10 supported chat platforms: name, icon, official URL, extraction status + adapter type.
 * - Dedicated adapter (site-specific selectors): chatgpt, gemini, claude, perplexity
 * - Generic adapter (shared resilient extractor in content/generic.js): the rest
 * No API connectivity is claimed here — the extension works via in-page extraction.
 */
export const PLATFORMS = [
  { id: 'chatgpt',    name: 'ChatGPT',          icon: '✦', url: 'https://chatgpt.com',          status: 'Available', via: 'dedicated' },
  { id: 'gemini',     name: 'Google Gemini',    icon: '✦', url: 'https://gemini.google.com',    status: 'Available', via: 'dedicated' },
  { id: 'claude',     name: 'Claude',           icon: '✳', url: 'https://claude.ai',            status: 'Available', via: 'dedicated' },
  { id: 'perplexity', name: 'Perplexity',       icon: '◈', url: 'https://www.perplexity.ai',    status: 'Available', via: 'dedicated' },
  { id: 'deepseek',   name: 'DeepSeek',         icon: '🌊', url: 'https://chat.deepseek.com',    status: 'Available', via: 'generic' },
  { id: 'copilot',    name: 'Microsoft Copilot', icon: '◉', url: 'https://copilot.microsoft.com', status: 'Available', via: 'generic' },
  { id: 'mistral',    name: 'Mistral Le Chat',  icon: '✳', url: 'https://chat.mistral.ai',      status: 'Available', via: 'generic' },
  { id: 'qwen',       name: 'Qwen',             icon: '○', url: 'https://chat.qwen.ai',         status: 'Available', via: 'generic' },
  { id: 'grok',       name: 'Grok',             icon: '✕', url: 'https://grok.com',             status: 'Available', via: 'generic' },
  { id: 'metaai',     name: 'Meta AI',          icon: '∞', url: 'https://www.meta.ai',          status: 'Available', via: 'generic' },
];

export function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) ?? null;
}

export function platformLabel(id) {
  return getPlatform(id)?.name ?? 'Unknown / Generic';
}
