/**
 * Glossopetrae Integration Service
 *
 * Provides graceful degradation when Glossopetrae is not installed.
 * Supports bidirectional translation (encode/decode) for conlang text.
 */

// Type definitions for Glossopetrae (since it's optional)
interface LanguageInterface {
  info: {
    name: string;
    seed: string | null;
    lexiconSize: number;
    wordOrder: string;
  };
  enc(text: string): string;
  dec(text: string): string;
  translate(text: string): string;
  translateBack(text: string): string;
  lookup(word: string): unknown;
  getLexicon(): unknown[];
  getGrammar(): unknown;
}

interface GlossopetraeSkillType {
  forge(options?: { seed?: string; name?: string }): Promise<LanguageInterface>;
  forgeStealthLanguage(preset?: string, seed?: string): Promise<LanguageInterface>;
  getStealthPresets(): Array<{ id: string; name: string; attributes: string[]; description: string }>;
}

// State
let glossopetraeAvailable = false;
let GlossopetraeSkill: GlossopetraeSkillType | null = null;
const languageCache = new Map<string, LanguageInterface>();
let initializationAttempted = false;
let initializationError: string | null = null;

/**
 * Attempt to load Glossopetrae module
 * Returns true if available, false otherwise
 */
export async function initializeGlossopetrae(): Promise<boolean> {
  if (initializationAttempted) {
    return glossopetraeAvailable;
  }

  initializationAttempted = true;

  // Only attempt to load if explicitly enabled via environment variable
  // This prevents Vite from analyzing the import when Glossopetrae is not installed
  const envEnabled = import.meta.env.VITE_GLOSSOPETRAE_ENABLED;
  if (envEnabled !== 'true') {
    console.log('[Glossopetrae] Not enabled (VITE_GLOSSOPETRAE_ENABLED != true)');
    return false;
  }

  try {
    // Dynamic import - only reached when VITE_GLOSSOPETRAE_ENABLED=true
    // At that point, the files should exist because they were installed during Docker build
    // Using a variable path bypasses Vite's static import analysis
    const modulePath = '../lib/glossopetrae/skill/GlossopetraeSkill.js';
    const module = await import(/* @vite-ignore */ modulePath);
    GlossopetraeSkill = module.GlossopetraeSkill || module.default;
    glossopetraeAvailable = true;
    console.log('[Glossopetrae] Loaded successfully');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    initializationError = message;
    console.error('[Glossopetrae] Failed to load despite being enabled:', message);
    return false;
  }
}

/**
 * Check if Glossopetrae is available
 */
export function isGlossopetraeAvailable(): boolean {
  return glossopetraeAvailable;
}

/**
 * Get initialization error message (if any)
 */
export function getInitializationError(): string | null {
  return initializationError;
}

/**
 * Get or create a language instance for a given seed
 */
async function getLanguage(seed: string): Promise<LanguageInterface | null> {
  if (!GlossopetraeSkill) return null;

  // Check cache
  if (languageCache.has(seed)) {
    return languageCache.get(seed)!;
  }

  try {
    const lang = await GlossopetraeSkill.forge({ seed });
    languageCache.set(seed, lang);
    return lang;
  } catch (err) {
    console.error('[Glossopetrae] Failed to forge language:', err);
    return null;
  }
}

/**
 * Decode conlang text to English
 * @param text - Conlang text to decode
 * @param seed - Language seed
 * @returns Decoded English text, or null if decode fails
 */
export async function decode(text: string, seed: string): Promise<string | null> {
  if (!glossopetraeAvailable) return null;

  const lang = await getLanguage(seed);
  if (!lang) return null;

  try {
    return lang.dec(text);
  } catch {
    // Not valid conlang text - this is expected for non-conlang content
    return null;
  }
}

/**
 * Encode English text to conlang
 * @param text - English text to encode
 * @param seed - Language seed
 * @returns Encoded conlang text, or null if encode fails
 */
export async function encode(text: string, seed: string): Promise<string | null> {
  if (!glossopetraeAvailable) return null;

  const lang = await getLanguage(seed);
  if (!lang) return null;

  try {
    return lang.enc(text);
  } catch (err) {
    console.error('[Glossopetrae] Encode failed:', err);
    return null;
  }
}

/**
 * Get language info for a seed
 */
export async function getLanguageInfo(seed: string): Promise<{
  name: string;
  seed: string | null;
  lexiconSize: number;
  wordOrder: string;
} | null> {
  if (!glossopetraeAvailable) return null;

  const lang = await getLanguage(seed);
  if (!lang) return null;

  return lang.info;
}

/**
 * Look up a single word in the language's lexicon
 */
export async function lookupWord(word: string, seed: string): Promise<unknown | null> {
  if (!glossopetraeAvailable) return null;

  const lang = await getLanguage(seed);
  if (!lang) return null;

  try {
    return lang.lookup(word);
  } catch {
    return null;
  }
}

/**
 * Get available stealth presets
 */
export function getStealthPresets(): Array<{ id: string; name: string; attributes: string[]; description: string }> | null {
  if (!GlossopetraeSkill) return null;
  return GlossopetraeSkill.getStealthPresets();
}

/**
 * Clear the language cache (useful when changing seeds)
 */
export function clearLanguageCache(): void {
  languageCache.clear();
}

/**
 * Try to decode text with multiple seeds, returning first successful decode
 * @param text - Text to decode
 * @param seeds - Array of seeds to try
 * @returns Object with decoded text and matching seed, or null if none match
 */
export async function decodeWithMultipleSeeds(
  text: string,
  seeds: string[]
): Promise<{ decoded: string; seed: string } | null> {
  if (!glossopetraeAvailable || seeds.length === 0) return null;

  for (const seed of seeds) {
    const decoded = await decode(text, seed);
    if (decoded && decoded !== text) {
      return { decoded, seed };
    }
  }

  return null;
}
