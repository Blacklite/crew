/**
 * crew-prompt — Azure Function HTTP Trigger
 *
 * Accepts an HTTP POST with a content prompt, wakes up the Content
 * Review Crew, and returns a structured JSON review.
 *
 * POST /api/crew-prompt
 * Body: { "prompt": "Your blog post or article text here..." }
 *
 * Returns: CrewReviewResult with reviews from all three agents.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { crewConfig } from '../crew/config.js';
import { runContentReview } from '../crew/handlers.js';
import type { CrewReviewResult } from '../crew/handlers.js';

interface PromptRequest {
  prompt?: string;
}

async function crewPrompt(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log(`[crew-prompt] ${request.method} request received`);

  // ── Validate request ───────────────────────────────────────────────
  if (request.method !== 'POST') {
    return {
      status: 405,
      jsonBody: { error: 'Method not allowed. Use POST.' },
    };
  }

  let body: PromptRequest;
  try {
    body = (await request.json()) as PromptRequest;
  } catch {
    return {
      status: 400,
      jsonBody: { error: 'Invalid JSON body.' },
    };
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return {
      status: 400,
      jsonBody: { error: 'Missing "prompt" field in request body.' },
    };
  }

  // ── Log crew config for observability ─────────────────────────────
  context.log(`[crew-prompt] Team: ${crewConfig.team.name}`);
  context.log(`[crew-prompt] Agents: ${crewConfig.agents.map(a => a.name).join(', ')}`);
  context.log(`[crew-prompt] Prompt length: ${prompt.length} chars`);

  // ── Run the review crew ───────────────────────────────────────────
  const result: CrewReviewResult = runContentReview(prompt);

  context.log(`[crew-prompt] Review complete. Overall score: ${result.overallScore}/10`);

  return {
    status: 200,
    jsonBody: result,
    headers: { 'Content-Type': 'application/json' },
  };
}

// ── Register the Azure Function ──────────────────────────────────────

app.http('crew-prompt', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: crewPrompt,
});

// ── Standalone mode (for testing without Azure Functions runtime) ────

const isDryRun = process.argv.includes('--dry-run');
const isStandalone = process.argv[1]?.includes('crew-prompt');

if (isStandalone && !isDryRun) {
  console.log('🚀 Azure Function registered: POST /api/crew-prompt');
  console.log(`   Team: ${crewConfig.team.name}`);
  console.log(`   Agents: ${crewConfig.agents.map(a => a.name).join(', ')}`);
  console.log('\n   Start with: func start');
  console.log('   Or test with the curl examples in README.md\n');
}

if (isDryRun) {
  // Quick validation that config and handlers load correctly
  const testResult = runContentReview('This is a test prompt for dry-run validation.');
  console.log('✅ Dry run passed. Config loads, handlers execute.');
  console.log(`   Team: ${crewConfig.team.name}`);
  console.log(`   Agents: ${testResult.reviews.map(r => r.agent).join(', ')}`);
  console.log(`   Score: ${testResult.overallScore}/10`);
  process.exit(0);
}
