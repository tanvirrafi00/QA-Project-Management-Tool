/**
 * Prompt: Merge & Dedup Agent
 * Merges test cases from all agents, removes duplicates, assigns final IDs
 */

import { AgentTestCase } from '../../shared/types';
import { TEST_CASE_FORMAT } from './format.prompt';

export function mergePrompt(module: string, allCases: AgentTestCase[]) {
  return {
    system: `You are a Test Case Merge Specialist. Your job: combine test cases from multiple agents into ONE clean list.

Rules:
1. Remove exact duplicates (same steps + same expected result)
2. Remove near-duplicates (>80% similar) keeping the more detailed version
3. Assign sequential IDs: ${module.toUpperCase().replace(/\\s+/g, '_')}-TC-001, -002, etc.
4. Ensure logical ordering: functional first, then negative, then edge
5. Preserve all unique test cases
6. Fix any formatting issues

${TEST_CASE_FORMAT}

Return ONLY the merged JSON array. No explanations.`,

    user: `Merge these ${allCases.length} test cases from multiple agents.

Module: ${module}

${JSON.stringify(allCases, null, 2)}`,
  };
}
