/**
 * AI Provider Manager
 * Manages provider fallback chain: GLM → Gemini → Demo
 * Abstracts AI access so business logic never calls providers directly
 */

import { AIProvider } from './base.provider';
import { GLMProvider } from './glm.provider';
import { GeminiProvider } from './gemini.provider';
import { ChatMessage, GenerationResult } from '../../shared/types';
import { AIError } from '../../shared/errors';
import logger from '../../shared/logger';

class AIProviderManager {
  private providers: AIProvider[] = [];

  constructor() {
    // Register providers in priority order. No demo/fake fallback — generation requires a real key.
    this.providers = [new GLMProvider(), new GeminiProvider()];
  }

  /**
   * Generate completion with automatic fallback across configured providers.
   * Throws `AIError` when no provider is available (no fake/demo data).
   */
  async generate(messages: ChatMessage[], options?: { maxTokens?: number }): Promise<GenerationResult> {
    const availableProviders = this.providers.filter(p => p.isAvailable());

    if (availableProviders.length === 0) {
      throw new AIError(
        'No AI provider configured. Set GLM_API_KEY or GEMINI_API_KEY to enable generation.',
        'manager',
      );
    }

    const errors: string[] = [];

    for (const provider of availableProviders) {
      try {
        logger.info(`Trying ${provider.name} (${provider.model})...`);
        const startTime = Date.now();
        const result = await provider.generate(messages, options);
        const duration = Date.now() - startTime;
        logger.aiExecution(provider.name, provider.model, duration, true);
        logger.info(`Success with ${provider.name}`);
        return result;
      } catch (error: any) {
        const msg = error.message?.substring(0, 150) || String(error);
        logger.warn(`${provider.name} failed: ${msg}`);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    throw new AIError(`All AI providers failed: ${errors.join(' | ')}`, 'manager');
  }

  /**
   * Check if any real provider is configured
   */
  isConfigured(): boolean {
    return this.providers.some(p => p.isAvailable());
  }

  /**
   * Get list of available provider names
   */
  getAvailableProviders(): string[] {
    return this.providers.filter(p => p.isAvailable()).map(p => p.name);
  }
}

export default new AIProviderManager();
