/**
 * Gemini Provider (Google Generative AI)
 * Fallback provider when GLM fails
 *
 * Uses @google/generative-ai SDK
 * Model: gemini-2.0-flash (configurable via GEMINI_MODEL env var)
 *
 * Features:
 * - Retry with exponential backoff for transient errors
 * - Graceful error handling
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './base.provider';
import { ChatMessage, GenerationResult } from '../../shared/types';
import { API_CONFIG } from '../../shared/constants';
import logger from '../../shared/logger';

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1500;

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private get apiKey(): string {
    return process.env.GEMINI_API_KEY || '';
  }

  /**
   * Model name - defaults to gemini-2.0-flash (latest stable flash model)
   * gemini-1.5-flash was deprecated and returns 404
   */
  get model(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  private getClient(): GoogleGenerativeAI {
    return new GoogleGenerativeAI(this.apiKey);
  }

  isAvailable(): boolean {
    const key = this.apiKey;
    // Google API keys typically start with "AIza" but we accept any key > 10 chars
    return !!(key && key.length > 10);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generate(messages: ChatMessage[], options?: { maxTokens?: number }): Promise<GenerationResult> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    const client = this.getClient();
    const model = client.getGenerativeModel({ model: this.model });

    // Combine messages for Gemini (it doesn't support system role natively in v1beta)
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');

    let prompt = '';
    if (systemMsg) {
      prompt += `SYSTEM: ${systemMsg.content}\n\n`;
    }
    userMsgs.forEach(m => {
      prompt += `${m.role.toUpperCase()}: ${m.content}\n\n`;
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: API_CONFIG.TEMPERATURE,
            maxOutputTokens: options?.maxTokens ?? API_CONFIG.MAX_TOKENS,
            responseMimeType: 'application/json',
          },
        });

        const content = result.response.text() || '{}';

        if (!content || content === '{}') {
          throw new Error('Gemini returned empty response');
        }

        if (attempt > 1) {
          logger.info(`Gemini succeeded on attempt ${attempt}`);
        }

        return { content, provider: this.name, model: this.model };
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.message?.substring(0, 150) || String(error);

        // 404 = model not found, don't retry (permanent error)
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          throw new Error(`Gemini model '${this.model}' not found (404). Try GEMINI_MODEL=gemini-2.0-flash`);
        }

        // 400 = bad request, don't retry
        if (errorMsg.includes('400') || errorMsg.includes('Bad Request')) {
          throw error;
        }

        // Transient errors - retry
        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.warn(`Gemini error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}ms: ${errorMsg}`);
          await this.sleep(backoff);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Gemini failed after all retries');
  }
}
