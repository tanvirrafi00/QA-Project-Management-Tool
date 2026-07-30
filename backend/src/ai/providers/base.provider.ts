/**
 * Base AI Provider Interface
 * All AI providers must implement this interface
 * This allows easy switching between providers
 */

import { ChatMessage, GenerationResult } from '../../shared/types';

export interface AIProvider {
    /** Provider name (e.g., 'glm', 'gemini', 'demo') */
    readonly name: string;

    /** Model identifier */
    readonly model: string;

    /** Check if this provider is configured and available */
    isAvailable(): boolean;

    /** Generate a completion from messages. `options.maxTokens` raises the output budget (e.g. for a
     *  single unified generation call producing many cases). */
    generate(messages: ChatMessage[], options?: { maxTokens?: number }): Promise<GenerationResult>;
}
