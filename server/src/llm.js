// LLM 제공자 추상화 — .env LLM_MODEL(chatgpt|claude|gemini|nvidia)로 선택.
// callLLM({ system, user, temperature, maxTokens }) → { provider, model, content, finishReason, usage:{completion_tokens,prompt_tokens} }
// finishReason='length' = max_tokens 초과로 잘림(제공자별 표현을 통일).

export function llmProvider() {
  return String(process.env.LLM_MODEL || 'nvidia').trim().toLowerCase()
}

// OpenAI 호환 (chatgpt · nvidia) — /chat/completions
async function callOpenAICompat({ url, apiKey, model, name }, { system, user, temperature, maxTokens }) {
  if (!apiKey) throw new Error(`${name} API 키가 설정되지 않았습니다.`)
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature, top_p: 0.9, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) throw new Error(`${name} 오류 ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const out = await r.json()
  const ch = out?.choices?.[0] || {}
  return {
    model, content: ch.message?.content || '', finishReason: ch.finish_reason || '',
    usage: { completion_tokens: out?.usage?.completion_tokens, prompt_tokens: out?.usage?.prompt_tokens },
  }
}

// Anthropic Claude — /v1/messages
async function callClaude({ system, user, temperature, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다.')
  const model = process.env.ANTHROPIC_MODEL_NAME || process.env.CLAUDE_MODEL_NAME || 'claude-3-5-sonnet-latest'
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!r.ok) throw new Error(`Claude 오류 ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const out = await r.json()
  return {
    model,
    content: (out?.content || []).map((b) => b.text || '').join(''),
    finishReason: out?.stop_reason === 'max_tokens' ? 'length' : (out?.stop_reason || ''),
    usage: { completion_tokens: out?.usage?.output_tokens, prompt_tokens: out?.usage?.input_tokens },
  }
}

// Google Gemini — /v1beta/models/{model}:generateContent
async function callGemini({ system, user, temperature, maxTokens }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 설정되지 않았습니다.')
  const model = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash'
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  })
  if (!r.ok) throw new Error(`Gemini 오류 ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const out = await r.json()
  const cand = out?.candidates?.[0] || {}
  return {
    model,
    content: (cand.content?.parts || []).map((p) => p.text || '').join(''),
    finishReason: cand.finishReason === 'MAX_TOKENS' ? 'length' : (cand.finishReason || ''),
    usage: { completion_tokens: out?.usageMetadata?.candidatesTokenCount, prompt_tokens: out?.usageMetadata?.promptTokenCount },
  }
}

export async function callLLM({ system, user, temperature = 0.3, maxTokens = 8192 }) {
  const p = llmProvider()
  const args = { system, user, temperature, maxTokens }
  let res
  if (p === 'chatgpt' || p === 'openai') {
    res = await callOpenAICompat({ url: 'https://api.openai.com/v1/chat/completions', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini', name: 'OpenAI' }, args)
  } else if (p === 'nvidia') {
    res = await callOpenAICompat({ url: 'https://integrate.api.nvidia.com/v1/chat/completions', apiKey: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL_NAME || 'meta/llama-3.1-8b-instruct', name: 'NVIDIA' }, args)
  } else if (p === 'claude' || p === 'anthropic') {
    res = await callClaude(args)
  } else if (p === 'gemini' || p === 'google') {
    res = await callGemini(args)
  } else {
    throw new Error(`알 수 없는 LLM_MODEL: ${p} (chatgpt|claude|gemini|nvidia 중 하나)`)
  }
  return { provider: p, ...res }
}
