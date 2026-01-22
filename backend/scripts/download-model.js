/**
 * Pre-download the zero-shot classification model for refusal detection.
 * This script runs during Docker build to bundle the model in the image.
 */

const { pipeline, env } = require('@xenova/transformers');

// ONNX model compatible with transformers.js (configurable via env var)
const MODEL_ID = process.env.REFUSAL_MODEL_ID || 'Xenova/nli-deberta-v3-small';
const CACHE_DIR = process.env.MODEL_CACHE_DIR || '/app/models';

async function downloadModel() {
  console.log(`[download-model] Downloading model: ${MODEL_ID}`);
  console.log(`[download-model] Cache directory: ${CACHE_DIR}`);

  // Configure transformers.js
  env.cacheDir = CACHE_DIR;
  env.allowRemoteModels = true;  // Allow downloading during build

  const startTime = Date.now();

  try {
    // Initialize the pipeline to trigger model download
    const classifier = await pipeline('zero-shot-classification', MODEL_ID, {
      cache_dir: CACHE_DIR,
    });

    // Run a quick test to ensure model works
    const testResult = await classifier('This is a test.', ['positive', 'negative']);
    console.log('[download-model] Model test successful:', testResult);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[download-model] Model downloaded successfully in ${elapsed}s`);

    // Dispose of the pipeline
    if (classifier.dispose) {
      await classifier.dispose();
    }

    process.exit(0);
  } catch (error) {
    console.error('[download-model] Failed to download model:', error);
    process.exit(1);
  }
}

downloadModel();
