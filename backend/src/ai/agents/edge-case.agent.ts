/**
 * Edge Case & Boundary Agent
 * Generates boundary value analysis and edge scenario test cases
 */

import { BaseAgent } from './base.agent';
import { AgentOutput, ParsedRequirement } from '../../shared/types';
import { edgePrompt } from '../../prompts/test-generation/edge.prompt';

class EdgeCaseAgent extends BaseAgent {
    readonly name = 'edge';

    async run(requirement: ParsedRequirement): Promise<AgentOutput> {
        const prompt = edgePrompt(requirement);

        return this.runAgent(
            [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
            ],
            requirement.module,
            'Edge Case agent completed'
        );
    }
}

export default new EdgeCaseAgent();
