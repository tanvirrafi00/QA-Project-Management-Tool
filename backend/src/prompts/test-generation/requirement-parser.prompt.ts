/**
 * Prompt: Requirement Parser Agent
 * Parses raw requirements into structured format
 */

import { TestCaseInput } from '../../shared/types';

export function requirementParserPrompt(input: TestCaseInput) {
    return {
        system: `You are a Senior Business Analyst and QA Architect with 20 years of experience.

Parse and decompose the requirement into a structured format for test case generation.

Extract: module, feature, actors, permissions, fields, validations, business rules, dependencies, missing info.

Return JSON:
{
  "module": "Module name",
  "feature": "Feature name",
  "actors": ["roles"],
  "permissions": ["permissions"],
  "fields": [{"name":"","type":"","rules":[],"validations":[]}],
  "constraints": ["constraints"],
  "validations": ["validations"],
  "businessRules": ["rules"],
  "dependencies": ["dependencies"],
  "missingInfo": ["gaps"],
  "workflows": ["workflows"]
}

Return ONLY valid JSON.`,

        user: `Module: ${input.moduleName || 'Not specified'}
Feature: ${input.featureName || 'Not specified'}

User Story:
${input.userStory}

${input.acceptanceCriteria ? `Acceptance Criteria:\n${input.acceptanceCriteria}` : ''}

${input.businessRules ? `Business Rules:\n${input.businessRules}` : ''}`,
    };
}
