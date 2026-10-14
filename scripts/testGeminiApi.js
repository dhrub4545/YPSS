require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const getGeminiApiKeys = () => {
  const keys = [];
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY'].forEach((keyName) => {
    const val = process.env[keyName]?.trim();
    if (val && !keys.includes(val)) {
      keys.push(val);
    }
  });
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(',').forEach((k) => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    });
  }
  return keys;
};

async function testGeminiModels() {
  const apiKeys = getGeminiApiKeys();
  console.log(`[TEST] Found ${apiKeys.length} Gemini API Key(s) in environment.`);

  if (!apiKeys.length) {
    console.error('[TEST] ERROR: No Gemini API keys found!');
    process.exit(1);
  }

  const { getDynamicGeminiModels } = require('../utils/geminiModelResolver');
  const dynamicModels = await getDynamicGeminiModels(apiKeys[0]);
  const testModels = dynamicModels.slice(0, 4);
  console.log(`[TEST] Auto-Discovered & Prioritized Models: ${testModels.join(', ')}`);

  const testResults = {};

  for (const modelName of testModels) {
    console.log(`\n========================================`);
    console.log(`Testing Model: ${modelName}`);
    console.log(`========================================`);

    let modelSuccess = false;

    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      try {
        console.log(`  -> Trying API Key #${i + 1}...`);
        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({ model: modelName });
        const prompt = 'Respond with exact valid JSON: {"model": "' + modelName + '", "status": "active", "timestamp": "' + new Date().toISOString() + '"}';
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        console.log(`  -> [SUCCESS] Key #${i + 1} with ${modelName}:`);
        console.log(`     Raw output: ${responseText.replace(/\n/g, ' ')}`);
        testResults[modelName] = { success: true, keyIndex: i + 1, response: responseText };
        modelSuccess = true;
        break;
      } catch (err) {
        console.warn(`  -> [FAILED] Key #${i + 1} with ${modelName}: ${err.message}`);
      }
    }

    if (!modelSuccess) {
      testResults[modelName] = { success: false, error: 'All keys failed' };
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY OF GEMINI API TESTS');
  console.log('========================================');
  let passedCount = 0;
  for (const [m, res] of Object.entries(testResults)) {
    if (res.success) {
      console.log(`PASS: ${m} (Key #${res.keyIndex})`);
      passedCount++;
    } else {
      console.log(`FAIL (Degraded/High Demand): ${m}`);
    }
  }

  if (passedCount === 0) {
    console.error('\nAll Gemini models failed API testing. Generation is offline.');
    process.exit(1);
  }

  console.log(`\nGemini API verification complete: ${passedCount}/${Object.keys(testResults).length} models active and operational!\n`);
}

testGeminiModels().catch((err) => {
  console.error('[TEST] Unhandled exception:', err);
  process.exit(1);
});
