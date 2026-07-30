/**
 * Prompt Template: Test Case Format Instructions
 * Shared instructions included in all test generation prompts
 * Optimized for speed: concise, structured, minimal token waste
 */

export const TEST_CASE_FORMAT = `
Output ONLY valid JSON (no markdown):
{"testCases":[{"name":"TC name","type":"functional","priority":"Critical","steps":["1. Step","2. Step"],"expectedResult":"Expected outcome","tags":["tag"]}],"reasoning":"Brief summary"}

Rules:
- Generate 10-15 test cases minimum
- priority: "Critical"|"High"|"Medium"|"Low"
- steps: numbered array, 2-5 steps each
- Cover every field, validation, and business rule
- Return ONLY JSON`;
