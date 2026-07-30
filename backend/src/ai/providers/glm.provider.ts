/**
 * GLM Provider (Z.ai Platform)
 * Uses Anthropic-compatible API
 *
 * POST https://api.z.ai/api/anthropic/v1/messages
 * Headers: x-api-key, anthropic-version: 2023-06-01
 * Model: glm-5 (configured via GLM_MODEL env var)
 *
 * Features:
 * - Retry with exponential backoff for transient errors (429, 500, 502, 503, 529)
 * - Immediate failure for permanent errors (400, 401, 403, 404)
 * - Timeout handling
 */

import { AIProvider } from './base.provider';
import { ChatMessage, GenerationResult } from '../../shared/types';
import { API_CONFIG, AI_MODELS } from '../../shared/constants';
import logger from '../../shared/logger';

// HTTP status codes that indicate a transient/server-side error worth retrying
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 529];
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; // 2 seconds initial backoff

export class GLMProvider implements AIProvider {
    readonly name = 'glm';

    private get apiKey(): string {
        return process.env.GLM_API_KEY || '';
    }

    get model(): string {
        return process.env.GLM_MODEL || AI_MODELS.GLM;
    }

    private get baseURL(): string {
        return process.env.GLM_API_URL || 'https://api.z.ai/api/anthropic';
    }

    isAvailable(): boolean {
        const key = this.apiKey;
        return !!(key && key.length > 10);
    }

    /**
     * Sleep for a given number of milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async generate(messages: ChatMessage[], options?: { maxTokens?: number }): Promise<GenerationResult> {
        const apiUrl = `${this.baseURL}/v1/messages`;

        // Convert to Anthropic format: system is top-level param
        const systemMessage = messages.find(m => m.role === 'system');
        const conversationMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            }));

        if (conversationMessages.length === 0 && systemMessage) {
            conversationMessages.push({ role: 'user', content: systemMessage.content });
        }

        const requestBody: any = {
            model: this.model,
            max_tokens: options?.maxTokens ?? API_CONFIG.MAX_TOKENS,
            messages: conversationMessages,
        };

        if (systemMessage) {
            requestBody.system = systemMessage.content;
        }

        // Retry loop with exponential backoff for transient errors
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const errorMsg = `GLM HTTP ${response.status}: ${errorText.substring(0, 200)}`;

                    // If retryable and we have attempts left, wait and retry
                    if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
                        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                        logger.warn(
                            `GLM transient error ${response.status} (attempt ${attempt}/${MAX_RETRIES}), ` +
                            `retrying in ${backoff}ms...`
                        );
                        lastError = new Error(errorMsg);
                        await this.sleep(backoff);
                        continue;
                    }

                    // Non-retryable or out of retries
                    throw new Error(errorMsg);
                }

                const data: any = await response.json();

                if (!data?.content?.length) {
                    throw new Error('GLM returned empty content');
                }

                const textBlocks = data.content
                    .filter((b: any) => b.type === 'text' && b.text)
                    .map((b: any) => b.text);
                const content = textBlocks.join('\n');

                if (!content) {
                    throw new Error('GLM returned no text');
                }

                if (attempt > 1) {
                    logger.info(`GLM succeeded on attempt ${attempt}`);
                }

                return { content, provider: this.name, model: this.model };
            } catch (error: any) {
                // Network errors (fetch throws) - retry if attempts left
                const isNetworkError = error.message?.includes('fetch') ||
                    error.message?.includes('ECONNRESET') ||
                    error.message?.includes('ETIMEDOUT') ||
                    error.message?.includes('network');

                if (isNetworkError && attempt < MAX_RETRIES) {
                    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                    logger.warn(
                        `GLM network error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}ms: ${error.message?.substring(0, 100)}`
                    );
                    lastError = error;
                    await this.sleep(backoff);
                    continue;
                }

                // If it's a transient HTTP error we already logged, use that
                if (lastError && RETRYABLE_STATUS_CODES.some(code => lastError!.message.includes(`HTTP ${code}`))) {
                    throw lastError;
                }

                throw error;
            }
        }

        // Exhausted all retries
        throw lastError || new Error('GLM failed after all retries');
    }
}
