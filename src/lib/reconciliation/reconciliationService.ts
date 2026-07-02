// ============================================================
// Reconciliation API service — SPEC §14
// Single Claude call; no streaming; strict JSON output.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { RECONCILIATION_SYSTEM_PROMPT } from './systemPrompt'
import type { ReconciliationContext, ReconciliationResult } from '@/types/reconciliation'
import { ReconciliationParseError } from '@/types/reconciliation'

const TIMEOUT_MS = 30_000

/**
 * Walk the cleaned response character-by-character to extract every top-level
 * JSON object, then return the last one that has the required ReconciliationResult
 * shape. This handles the "self-correction" pattern where the model emits prose
 * followed by a second, corrected JSON object — regex-based extraction breaks on
 * nested objects inside the prose.
 */
function extractLastValidResult(raw: string): ReconciliationResult {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')

  const candidates: string[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (cleaned[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        candidates.push(cleaned.slice(start, i + 1))
        start = -1
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(candidates[i])
      if (
        obj.summary &&
        typeof obj.summary.status === 'string' &&
        Array.isArray(obj.suggestions) &&
        Array.isArray(obj.flags) &&
        typeof obj.reconciliation_complete === 'boolean'
      ) {
        return obj as ReconciliationResult
      }
    } catch {
      // malformed block — try the next candidate
    }
  }

  console.error('[reconciliation] No valid ReconciliationResult found. Raw response:', raw)
  throw new ReconciliationParseError(raw)
}

function getClient(): Anthropic {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY is not set. Add it to .env.local to use the AI assistant.',
    )
  }
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export async function runReconciliationSession(
  context: ReconciliationContext,
): Promise<ReconciliationResult> {
  const client = getClient()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let rawText = ''
  try {
    const response = await client.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: RECONCILIATION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(context),
          },
        ],
      },
      { signal: controller.signal },
    )

    const block = response.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('AI returned no text content')
    }
    rawText = block.text
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Analysis is taking longer than expected. Please try again.')
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error('Reconciliation service unavailable. Please try again later.')
    }
    // Network / fetch failure
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('No connection. Please check your network and try again.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  // Brace-matched extraction handles multi-object responses and nested structures.
  // The shape guard is inside extractLastValidResult — no further checks needed.
  return extractLastValidResult(rawText)
}
