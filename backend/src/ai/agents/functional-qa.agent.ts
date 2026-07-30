/**
 * Functional QA Agent
 * Generates positive/functional test cases for happy paths and core features
 */

import { BaseAgent } from './base.agent';
import { AgentOutput, ParsedRequirement } from '../../shared/types';
import { functionalPrompt } from '../../prompts/test-generation/functional.prompt';

class FunctionalQAAgent extends BaseAgent {
    readonly name = 'functional';

    async run(requirement: ParsedRequirement): Promise<AgentOutput> {
        const prompt = functionalPrompt(requirement);

        return this.runAgent(
            [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
            ],
            requirement.module,
            'Functional QA agent completed'
        );
    }
}

export default new FunctionalQAAgent();
