// Verified against https://console.groq.com/docs/structured-outputs (strict mode, constrained decoding).
export const STRICT_SCHEMA_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open',
]);

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

export function resolveGroqModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  return model || DEFAULT_GROQ_MODEL;
}

export function supportsStrictSchema(model) {
  return STRICT_SCHEMA_MODELS.has(model);
}

// Strict mode on Groq only guarantees structure; numeric bounds are enforced afterwards by parseAnalysisResponse.
function stripNumericBounds(schema) {
  if (Array.isArray(schema)) return schema.map(stripNumericBounds);
  if (!schema || typeof schema !== 'object') return schema;
  const copy = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'minimum' || key === 'maximum') continue;
    copy[key] = stripNumericBounds(value);
  }
  return copy;
}

export function buildGroqRequest({ model, system, input, schema, maxTokens = 2000 }) {
  const strict = supportsStrictSchema(model);
  const request = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'team_lab_progress_analysis', strict, schema: stripNumericBounds(schema) },
    },
    max_completion_tokens: maxTokens,
    temperature: 0,
    stream: false,
  };
  if (model.startsWith('openai/gpt-oss')) {
    request.reasoning_effort = 'low';
    request.include_reasoning = false;
  }
  return { request, strict };
}

export function normalizeGroqCompletion(completion) {
  const choice = completion?.choices?.[0];
  const content = choice?.message?.content;
  return {
    status: choice?.finish_reason === 'stop' && typeof content === 'string' ? 'completed' : 'incomplete',
    output_text: typeof content === 'string' ? content : '',
  };
}

export async function requestGroqAnalysis(client, options) {
  const { request, strict } = buildGroqRequest(options);
  const completion = await client.chat.completions.create(request, { timeout: 45_000, maxRetries: 0 });
  return { response: normalizeGroqCompletion(completion), strict };
}
