/**
 * Negative & Security QA Agent
 * Generates error handling, negative, and security vulnerability test cases
 */

import { BaseAgent } from './base.agent';
import { AgentOutput, ParsedRequirement } from '../../shared/types';
import { negativePrompt } from '../../prompts/test-generation/negative.prompt';

class NegativeQAAgent extends BaseAgent {
    readonly name = 'negative';

    async run(requirement: ParsedRequirement): Promise<AgentOutput> {
        const prompt = negativePrompt(requirement);

        return this.runAgent(
            [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
            ],
            requirement.module,
            'Negative & Security QA agent completed'
        );
    }
}

export default new NegativeQAAgent();
