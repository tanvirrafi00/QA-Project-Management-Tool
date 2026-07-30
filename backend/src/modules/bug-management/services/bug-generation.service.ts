/**
 * AI Bug Generation Service
 * Uses GLM-5 to generate professional bug reports from user input.
 *
 * Pipeline:
 *   User Input → AI Analysis → Bug Report (title, severity, priority, module, steps, impact, root cause)
 */

import aiProviderManager from '../../../ai/providers/provider.manager';
import jsonParser from '../../../ai/parsers/json-parser.service';
import bugRepository from '../repositories/bug.repository';
import generationsRepository from '../../../shared/db/repositories/generations.repository';
import logger from '../../../shared/logger';
import {
    BugGenerationInput,
    BugGenerationResult,
    AIBugReport,
    BugLayer,
    BugSeverity,
    BugPriority,
} from '../types';

class BugGenerationService {
    /**
     * Generate a professional bug report from user input
     */
    async generate(input: BugGenerationInput): Promise<BugGenerationResult> {
        const startTime = Date.now();
        logger.info('🐛 BUG GENERATION STARTED', { layer: input.layer, method: input.inputMethod });

        const prompt = this.buildPrompt(input);

        // Call AI provider
        const result = await aiProviderManager.generate([
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
        ]);

        const duration = Date.now() - startTime;
        logger.info(`AI bug generation completed in ${duration}ms via ${result.provider}`);

        // Parse the AI response
        const report = this.parseReport(result.content, input);

        // Find similar bugs in repository
        report.similarBugs = await bugRepository.findSimilar(report.title, report.module);

        // Generate bug ID
        const bugId = bugRepository.generateBugId();

        logger.info(`Bug report generated: ${report.title} (${report.severity}/${report.priority})`);

        // Record AI provenance (best-effort; no-op without a DB).
        await generationsRepository.record({
            module: report.module ?? null,
            feature: 'bug-report',
            provider: result.provider ?? null,
            agents: ['bug-analyst'],
            status: 'succeeded',
            durationMs: duration,
        });

        return {
            bugId,
            projectName: input.projectName,
            layer: input.layer,
            report,
        };
    }

    /**
     * Build the AI prompt for bug report generation
     */
    private buildPrompt(input: BugGenerationInput): { system: string; user: string } {
        const system = `You are a Senior QA Engineer and Bug Analyst. Your job is to analyze issue descriptions and generate professional, comprehensive bug reports.

You MUST respond with ONLY a JSON object (no markdown, no explanation). The JSON must have this exact structure:

{
  "title": "Clear, concise bug title (max 80 chars). Format: [What is broken] + [Where]. Example: 'Max App Version Column Header Misaligned in Tab List Page'",
  "description": "A 2-3 sentence summary explaining WHAT is broken, WHERE it occurs, and WHY it matters. Write this as a professional overview that a project manager can understand.",
  "module": "Detected module name (e.g., Authentication, Role Management, Booking, Dashboard, Reports, User Management, Settings, Tab Management)",
  "severity": "Critical | High | Medium | Low",
  "priority": "P1 | P2 | P3 | P4",
  "environment": "Suggested environment (e.g., Production, Staging, All Environments, Chrome 120, Safari 17)",
  "precondition": "What must be true before reproducing (e.g., user role, data state, system state). Be specific.",
  "currentBehavior": ["List of observations about what is currently happening. Prefix working items with ✔️ and broken items with ❌. Example: '✔️ Tab list table loads', '❌ Max App Version header appears slightly misaligned'"],
  "stepsToReproduce": ["Step 1 - Login as Admin", "Step 2 - Navigate to ...", "Step 3 - Observe ...", "..."],
  "expectedResult": "What SHOULD happen according to requirements. Be specific and clear.",
  "actualResult": "What ACTUALLY happens (the observed bug behavior). Describe the visible symptom precisely.",
  "impact": "Business impact: who is affected, what workflows break, data/security implications, UI consistency issues",
  "possibleRootCause": "Likely technical root cause based on symptoms (e.g., CSS flexbox alignment, missing validation, race condition)",
  "suggestedFix": "Brief technical suggestion for how to fix (1-2 sentences). Be actionable.",
  "missingInfo": ["Missing info 1", "Missing info 2"],
  "tags": ["relevant", "tags", "for", "categorization"],
  "aiConfidence": 85
}

WRITING GUIDELINES:
- Title: Start with what's broken, then where. Be specific but concise.
- Description: Write a clear overview that explains the problem in plain language.
- Current Behavior: List what works (✔️) and what's broken (❌). This gives a quick snapshot of the issue.
- Steps to Reproduce: Each step should be a clear, actionable instruction. Number them implicitly.
- Expected vs Actual: Use precise language. Expected = ideal behavior, Actual = observed bug.
- Impact: Mention user experience, business process, or data implications.

SEVERITY GUIDELINES:
- Critical: Data loss, security breach, system crash, payment failure, data corruption
- High: Core feature broken, blocking user workflow, significant functionality impaired
- Medium: Feature partially broken, workaround exists, non-critical path affected, UI misalignment impacting usability
- Low: Cosmetic issue, minor inconvenience, spelling/alignment problems, visual polish

PRIORITY GUIDELINES:
- P1: Fix immediately (Critical severity, production blocker)
- P2: Fix this sprint (High severity, major impact)
- P3: Fix next sprint (Medium severity, moderate impact)
- P4: Backlog (Low severity, minor impact)

TAG EXAMPLES: authentication, validation, ui, api, database, security, performance, data-loss, race-condition, null-reference, alignment, css, responsive

Respond with JSON ONLY.`;

        let userContent = `Bug Layer: ${input.layer}\nProject: ${input.projectName}\n\n`;

        if (input.inputMethod === 'description' && input.description) {
            userContent += `ISSUE DESCRIPTION:\n${input.description}`;
        } else if (input.inputMethod === 'structured') {
            userContent += `STRUCTURED INPUT:\n`;
            userContent += `Module: ${input.module || 'Not specified'}\n`;
            userContent += `Expected Result: ${input.expectedResult || 'Not specified'}\n`;
            userContent += `Actual Result: ${input.actualResult || 'Not specified'}\n`;
            userContent += `Steps: ${input.steps || 'Not specified'}`;
        } else if (input.inputMethod === 'log' && input.logs) {
            userContent += `LOG ANALYSIS:\n${input.logs}`;
        }

        return { system, user: userContent };
    }

    /**
     * Parse the AI response into a structured bug report
     */
    private parseReport(content: string, input: BugGenerationInput): AIBugReport {
        // Try JSON parse first
        const parsed: any = jsonParser.parseSafe<any>(content, null);

        if (parsed && parsed.title) {
            return {
                title: String(parsed.title).substring(0, 120),
                description: String(parsed.description || parsed.title || 'No description provided'),
                module: String(parsed.module || input.module || 'Unknown'),
                severity: this.validateSeverity(parsed.severity),
                priority: this.validatePriority(parsed.priority),
                environment: String(parsed.environment || 'All Environments'),
                precondition: String(parsed.precondition || 'Not specified'),
                currentBehavior: Array.isArray(parsed.currentBehavior)
                    ? parsed.currentBehavior.map((s: any) => String(s))
                    : ['❌ Issue observed (see description)'],
                stepsToReproduce: Array.isArray(parsed.stepsToReproduce)
                    ? parsed.stepsToReproduce.map((s: any) => String(s))
                    : ['Not specified'],
                expectedResult: String(parsed.expectedResult || 'Not specified'),
                actualResult: String(parsed.actualResult || 'Not specified'),
                impact: String(parsed.impact || 'Not specified'),
                possibleRootCause: String(parsed.possibleRootCause || 'Not determined'),
                suggestedFix: String(parsed.suggestedFix || 'Not specified'),
                similarBugs: [],
                missingInfo: Array.isArray(parsed.missingInfo)
                    ? parsed.missingInfo.map((s: any) => String(s))
                    : [],
                tags: Array.isArray(parsed.tags)
                    ? parsed.tags.map((t: any) => String(t))
                    : [String(parsed.module || 'general').toLowerCase()],
                aiConfidence: Number(parsed.aiConfidence) || 75,
            };
        }

        // Fallback: construct from raw text
        logger.warn('AI response not valid JSON, using fallback parser');
        return this.fallbackReport(content, input);
    }

    /**
     * Fallback report generation when AI returns non-JSON
     */
    private fallbackReport(content: string, input: BugGenerationInput): AIBugReport {
        const rawText = input.description || input.actualResult || content.substring(0, 200);
        return {
            title: rawText.substring(0, 80),
            description: rawText,
            module: input.module || 'Unknown',
            severity: 'Medium',
            priority: 'P3',
            environment: 'All Environments',
            precondition: 'User is logged in',
            currentBehavior: ['❌ Issue observed (see description)'],
            stepsToReproduce: ['See description'],
            expectedResult: 'Feature works as expected',
            actualResult: rawText,
            impact: 'Requires investigation',
            possibleRootCause: 'Not determined',
            suggestedFix: 'Investigate the issue and apply appropriate fix',
            similarBugs: [],
            missingInfo: ['Environment details', 'Browser/OS version'],
            tags: [String(input.module || 'general').toLowerCase()],
            aiConfidence: 50,
        };
    }

    /**
     * Validate severity value
     */
    private validateSeverity(val: any): BugSeverity {
        const valid: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
        const s = String(val).trim();
        return valid.includes(s as BugSeverity) ? (s as BugSeverity) : 'Medium';
    }

    /**
     * Validate priority value
     */
    private validatePriority(val: any): BugPriority {
        const valid: BugPriority[] = ['P1', 'P2', 'P3', 'P4'];
        const p = String(val).trim().toUpperCase();
        return valid.includes(p as BugPriority) ? (p as BugPriority) : 'P3';
    }
}

export default new BugGenerationService();
