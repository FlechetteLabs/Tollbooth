/**
 * RefusalAnalyzer - Zero-shot classification for refusal detection using transformers.js
 * Falls back to keyword-based detection if ML model is unavailable
 */

import { pipeline, env } from '@xenova/transformers';
import type { ZeroShotClassificationPipeline } from '@xenova/transformers';
import { RefusalAnalysisResult } from '../types';

// Configure transformers.js to allow downloading models (cached locally after first use)
env.allowLocalModels = true;
env.allowRemoteModels = true;

// Set HuggingFace token if available (required for model downloads)
if (process.env.HF_TOKEN) {
  (env as any).HF_TOKEN = process.env.HF_TOKEN;
}

// Labels for zero-shot classification
const REFUSAL_LABELS = [
  'refusal to help',
  'ethical concern',
  'policy violation',
  'cannot assist',
  'helpful response',
  'compliant response',
];

// Labels that indicate a refusal
const NEGATIVE_LABELS = new Set([
  'refusal to help',
  'ethical concern',
  'policy violation',
  'cannot assist',
]);

// Model to use for classification (ONNX model compatible with transformers.js)
// Configurable via REFUSAL_MODEL_ID env var. Options:
//   - Xenova/nli-deberta-v3-xsmall (~90MB, fastest)
//   - Xenova/nli-deberta-v3-small (~180MB, good balance)
//   - Xenova/bart-large-mnli (~1.6GB, most accurate)
const MODEL_ID = process.env.REFUSAL_MODEL_ID || 'Xenova/nli-deberta-v3-small';
const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR || '/app/models';

// Keyword patterns for fallback detection (when ML model unavailable)
const REFUSAL_PATTERNS = [
  // Direct refusals
  /\bI (?:can't|cannot|won't|will not|am unable to|am not able to)\b.*\b(?:help|assist|provide|create|generate|write|do that)\b/i,
  /\bI'm (?:not able|unable|not going) to\b/i,
  /\bI (?:can't|cannot|won't) (?:do|help with) that\b/i,

  // Ethical/policy language
  /\b(?:against|violates?) (?:my|the) (?:ethics|guidelines|policies|terms|rules)\b/i,
  /\b(?:ethical|safety|policy) (?:concerns?|guidelines?|reasons?)\b/i,
  /\bnot (?:something|anything) I (?:can|am able to)\b/i,

  // Harmful content refusals
  /\b(?:harmful|dangerous|illegal|malicious|unethical)\b.*\b(?:content|activity|request)\b/i,
  /\bcould (?:be used|cause|lead) to (?:harm|damage|hurt)\b/i,

  // Apology + refusal patterns
  /\b(?:I'm sorry|I apologize|Unfortunately),? (?:but )?I (?:can't|cannot|won't)\b/i,
  /\bI (?:must|have to) (?:decline|refuse|respectfully decline)\b/i,

  // Claude-specific patterns
  /\bI don't (?:think I should|feel comfortable)\b/i,
  /\bI'd (?:prefer not to|rather not)\b/i,
  /\bnot (?:comfortable|willing) (?:to |with )?(?:help|assist|provid)/i,
];

export class RefusalAnalyzer {
  private classifier: ZeroShotClassificationPipeline | null = null;
  private ready = false;
  private useFallback = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the classifier by loading the bundled model
   * Falls back to keyword detection if model unavailable
   */
  async initialize(): Promise<void> {
    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    console.log('[RefusalAnalyzer] Initializing zero-shot classifier...');
    const startTime = Date.now();

    try {
      // Set cache directory for model files
      env.cacheDir = MODEL_CACHE_DIR;

      this.classifier = await pipeline('zero-shot-classification', MODEL_ID, {
        cache_dir: MODEL_CACHE_DIR,
      });

      this.ready = true;
      this.useFallback = false;
      const elapsed = Date.now() - startTime;
      console.log(`[RefusalAnalyzer] ML classifier ready in ${elapsed}ms`);
    } catch (error) {
      console.error('[RefusalAnalyzer] Failed to initialize ML classifier:', error);
      console.log('[RefusalAnalyzer] Falling back to keyword-based detection');
      this.ready = true;
      this.useFallback = true;
    }
  }

  /**
   * Check if the analyzer is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Check if using fallback keyword detection
   */
  isUsingFallback(): boolean {
    return this.useFallback;
  }

  /**
   * Analyze text for refusal content using keyword patterns
   */
  private analyzeWithKeywords(
    text: string,
    tokensToAnalyze: number,
    confidenceThreshold: number
  ): RefusalAnalysisResult {
    const startTime = Date.now();

    // Truncate text if tokens specified
    let analyzedText = text;
    let tokensAnalyzed = 0;

    if (tokensToAnalyze > 0) {
      const charLimit = tokensToAnalyze * 4;
      if (text.length > charLimit) {
        analyzedText = text.slice(0, charLimit);
      }
      tokensAnalyzed = Math.ceil(analyzedText.length / 4);
    } else {
      tokensAnalyzed = Math.ceil(text.length / 4);
    }

    // Check each pattern
    const matchedPatterns: string[] = [];
    for (const pattern of REFUSAL_PATTERNS) {
      if (pattern.test(analyzedText)) {
        matchedPatterns.push(pattern.source);
      }
    }

    // Calculate confidence based on number of patterns matched
    // 1 pattern = 0.6, 2 patterns = 0.75, 3+ patterns = 0.9
    let confidence = 0;
    if (matchedPatterns.length >= 3) {
      confidence = 0.9;
    } else if (matchedPatterns.length === 2) {
      confidence = 0.75;
    } else if (matchedPatterns.length === 1) {
      confidence = 0.6;
    }

    const analysisTimeMs = Date.now() - startTime;

    return {
      is_refusal: confidence >= confidenceThreshold,
      confidence,
      analyzed_text: analyzedText.slice(0, 200) + (analyzedText.length > 200 ? '...' : ''),
      tokens_analyzed: tokensAnalyzed,
      labels: matchedPatterns.map(p => ({ label: `pattern: ${p.slice(0, 30)}...`, score: 1.0 })),
      analysis_time_ms: analysisTimeMs,
    };
  }

  /**
   * Analyze text for refusal content
   *
   * @param text The text to analyze
   * @param tokensToAnalyze Number of tokens to analyze (0 = all)
   * @param confidenceThreshold Threshold for determining refusal (for is_refusal field)
   * @returns Analysis result
   */
  async analyze(
    text: string,
    tokensToAnalyze: number = 0,
    confidenceThreshold: number = 0.7
  ): Promise<RefusalAnalysisResult> {
    if (!this.ready) {
      throw new Error('RefusalAnalyzer not initialized. Call initialize() first.');
    }

    // Use keyword fallback if ML model not available
    if (this.useFallback || !this.classifier) {
      return this.analyzeWithKeywords(text, tokensToAnalyze, confidenceThreshold);
    }

    const startTime = Date.now();

    // Truncate text if tokens specified (rough approximation: 4 chars per token)
    let analyzedText = text;
    let tokensAnalyzed = 0;

    if (tokensToAnalyze > 0) {
      const charLimit = tokensToAnalyze * 4;
      if (text.length > charLimit) {
        analyzedText = text.slice(0, charLimit);
      }
      tokensAnalyzed = Math.ceil(analyzedText.length / 4);
    } else {
      tokensAnalyzed = Math.ceil(text.length / 4);
    }

    // Run zero-shot classification
    const rawResult = await this.classifier(analyzedText, REFUSAL_LABELS, {
      multi_label: true,
    });

    // Handle both single result and array result (we always pass single string so expect single result)
    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

    // Parse results - transformers.js returns { sequence, labels, scores }
    const labels: { label: string; score: number }[] = [];
    let refusalScore = 0;

    if (result && result.labels && result.scores) {
      for (let i = 0; i < result.labels.length; i++) {
        const label = result.labels[i];
        const score = result.scores[i];
        labels.push({ label, score });

        // Sum negative label scores for refusal confidence
        if (NEGATIVE_LABELS.has(label)) {
          refusalScore += score;
        }
      }
    }

    // Normalize refusal score (sum of 4 negative labels, each 0-1)
    // Divide by number of negative labels to get average
    const confidence = refusalScore / NEGATIVE_LABELS.size;

    const analysisTimeMs = Date.now() - startTime;

    return {
      is_refusal: confidence >= confidenceThreshold,
      confidence,
      analyzed_text: analyzedText.slice(0, 200) + (analyzedText.length > 200 ? '...' : ''),
      tokens_analyzed: tokensAnalyzed,
      labels,
      analysis_time_ms: analysisTimeMs,
    };
  }

  /**
   * Get memory usage info for debugging
   */
  getMemoryUsage(): { heapUsed: number; heapTotal: number } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    };
  }
}

// Singleton instance
export const refusalAnalyzer = new RefusalAnalyzer();
