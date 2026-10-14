require('dotenv').config();
const https = require('https');

let cachedModels = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // Cache for 1 hour

const STATIC_FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
];

/**
 * Dynamically queries Google's ModelService to find all active, supported models.
 * Automatically adapts when Google releases newer models or deprecates older ones.
 */
function fetchGoogleActiveModels(apiKey) {
  return new Promise((resolve) => {
    if (!apiKey) return resolve([]);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!Array.isArray(json.models)) return resolve([]);

          const valid = json.models
            .filter((m) => {
              const methods = m.supportedGenerationMethods || [];
              if (!methods.includes('generateContent')) return false;
              const name = m.name.replace('models/', '').toLowerCase();

              // Exclude non-multimodal/specialized endpoints (audio, tts, robotics, transcribe, etc.)
              if (
                name.includes('tts') ||
                name.includes('transcribe') ||
                name.includes('robotics') ||
                name.includes('computer-use') ||
                name.includes('banana') ||
                name.includes('argon') ||
                name.includes('lyria') ||
                name.includes('research')
              ) {
                return false;
              }
              return name.includes('gemini');
            })
            .map((m) => m.name.replace('models/', ''));

          // Score and rank models:
          // 1. Google floating aliases (e.g. gemini-flash-lite-latest, gemini-flash-latest)
          // 2. High-speed, high-availability lite models
          // 3. Newest flash models by descending version
          const score = (name) => {
            const n = name.toLowerCase();
            let pts = 0;
            if (n === 'gemini-flash-lite-latest') pts += 100;
            else if (n === 'gemini-flash-latest') pts += 80;
            else if (n.includes('flash-lite')) pts += 60;
            else if (n.includes('flash')) pts += 40;
            else if (n.includes('pro')) pts += 20;

            const verMatch = n.match(/(\d+(?:\.\d+)?)/);
            if (verMatch) pts += parseFloat(verMatch[1]);
            return pts;
          };

          valid.sort((a, b) => score(b) - score(a));
          resolve(valid);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

/**
 * Returns dynamic list of models, refreshing cache when needed or when explicitly requested.
 */
async function getDynamicGeminiModels(apiKey, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedModels && cachedModels.length && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const discovered = await fetchGoogleActiveModels(apiKey);
    if (discovered && discovered.length > 0) {
      cachedModels = discovered;
      lastFetchTime = now;
      console.log(`[GeminiModelResolver] Discovered ${discovered.length} active models from Google API. Prioritizing: ${discovered.slice(0, 3).join(', ')}`);
      return cachedModels;
    }
  } catch (err) {
    console.warn('[GeminiModelResolver] Model discovery failed, using fallback:', err.message);
  }

  return STATIC_FALLBACK_MODELS;
}

function invalidateModelCache() {
  cachedModels = null;
  lastFetchTime = 0;
}

module.exports = {
  getDynamicGeminiModels,
  invalidateModelCache,
  STATIC_FALLBACK_MODELS,
};
