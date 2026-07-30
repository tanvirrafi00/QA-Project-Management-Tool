/**
 * AI JSON Parser
 *
 * Parses and validates JSON returned by AI providers. Handles the common
 * formatting mistakes models make (markdown code fences, trailing commas,
 * malformed/unquoted keys) and degrades gracefully.
 *
 * Extracted from the retired `openai.service.ts` so the consolidated AI path
 * (`aiProviderManager`) keeps the same resilient parsing.
 */

import logger from '../logger';

/**
 * Parse and validate a JSON response from an AI provider.
 * Handles markdown code blocks, trailing commas, and minor formatting issues.
 * Throws when no valid JSON can be recovered.
 */
export function parseAiJson<T>(content: string): T {
  try {
    let jsonContent = content.trim();

    // Remove markdown code blocks if present (handles ```json and ```)
    jsonContent = jsonContent.replace(/```(?:json)?\s*\n?/gi, '').replace(/```\s*\n?/g, '');

    // Trim again after removing code blocks
    jsonContent = jsonContent.trim();

    // Try to extract the outermost JSON object or array
    const jsonMatch = jsonContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }

    // Attempt direct parse first
    try {
      return JSON.parse(jsonContent) as T;
    } catch {
      // Fall through to repair attempts
    }

    // Repair common AI JSON mistakes:
    // 1. Fix malformed keys like `" "steps"` → `"steps"`
    jsonContent = jsonContent.replace(/"\s*"\s*(\w+)"\s*:/g, '"$1":');

    // 2. Remove trailing commas before } or ]
    jsonContent = jsonContent.replace(/,\s*([}\]])/g, '$1');

    // 3. Fix missing quotes around keys (e.g., {id: "x"} → {"id": "x"})
    jsonContent = jsonContent.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

    try {
      return JSON.parse(jsonContent) as T;
    } catch {
      // Fall through to final attempt
    }

    // Last resort: try to find and parse the first valid JSON object
    const braceMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      let candidate = braceMatch[0];
      candidate = candidate.replace(/,\s*([}\]])/g, '$1');
      candidate = candidate.replace(/"\s*"\s*(\w+)"\s*:/g, '"$1":');
      return JSON.parse(candidate) as T;
    }

    throw new Error('No valid JSON found in response');
  } catch (error) {
    logger.error('Failed to parse AI response', { preview: content.substring(0, 500) });
    throw new Error('Invalid response from AI service');
  }
}

/**
 * Safe parse — returns a default value instead of throwing.
 * Useful for agent resilience.
 */
export function parseAiJsonSafe<T>(content: string, defaultValue: T): T {
  try {
    return parseAiJson<T>(content);
  } catch {
    logger.warn('Using default value due to parse failure');
    return defaultValue;
  }
}
