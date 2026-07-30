/**
 * Requirement Intelligence Processing Layer
 *
 * Processes raw, messy requirements through a 10-stage pipeline before
 * sending them to the AI test generation engine.
 *
 * Stages:
 * 1. Input Cleanup Engine (programmatic)
 * 2. Requirement Segmentation (AI)
 * 3. Requirement Classification (AI)
 * 4. Entity Extraction (AI)
 * 5. Missing Requirement Detection (AI)
 * 6. Requirement Enhancement (AI)
 * 7. Markdown Normalization (programmatic)
 * 8. Requirement Chunking (programmatic, for large inputs)
 * 9. Requirement Scoring (AI)
 * 10. Final AI-Ready Requirement
 *
 * Stages 2-6 and 9 are combined into a single AI call for efficiency.
 */

import crypto from 'crypto';
import aiProviderManager from '../ai/providers/provider.manager';
import requirementCache from '../shared/cache/requirement-cache.service';
import { parseAiJsonSafe } from '../shared/utils/ai-json';
import logger from '../shared/logger';
import { TestCaseInput, ParsedRequirement } from '../shared/types';

export interface RequirementScore {
  completeness: number;  // 0-100
  clarity: number;       // 0-100
  qaReadiness: number;   // 0-100
}

export interface ProcessedRequirement {
  // Classification
  module: string;
  feature: string;

  // Segmented sections
  userStory: string;
  acceptanceCriteria: string[];
  businessRules: string[];
  permissions: string[];
  validations: string[];
  dependencies: string[];
  notifications: string[];
  auditLogs: string[];
  apiRequirements: string[];
  uiRequirements: string[];

  // Entities
  actors: string[];
  fields: Array<{
    name: string;
    type: string;
    rules: string[];
    validations: string[];
  }>;

  // Analysis
  missingInfo: string[];
  assumptions: string[];
  contradictions: string[];

  // Quality
  scores: RequirementScore;

  // Normalized markdown for AI agents
  markdown: string;

  // Metadata
  originalLength: number;
  cleanedLength: number;
  wasChunked: boolean;
}

class RequirementProcessorService {
  /**
   * Stage 1: Input Cleanup Engine (Programmatic)
   * Removes duplicates, extra whitespace, broken formatting
   */
  cleanInput(rawText: string): string {
    let cleaned = rawText;

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove duplicate consecutive lines (case-insensitive)
    const lines = cleaned.split('\n');
    const dedupedLines: string[] = [];
    let lastLine = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const normalized = trimmed.toLowerCase().replace(/[.\s]+$/, '');

      // Skip if duplicate of previous line
      if (normalized && normalized === lastLine) {
        continue;
      }

      lastLine = normalized;
      dedupedLines.push(line);
    }

    cleaned = dedupedLines.join('\n');

    // Remove excessive empty lines (max 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Fix broken markdown headers (missing space after #)
    cleaned = cleaned.replace(/^#{1,6}([^\s#])/gm, '#$1');

    // Remove trailing whitespace from each line
    cleaned = cleaned.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');

    // Trim overall
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Stage 8: Requirement Chunking (Programmatic)
   * Splits large requirements by markdown headers
   */
  chunkRequirement(text: string, maxChunkSize = 4000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    // Split by markdown headers
    const sections = text.split(/^(#{1,3}\s+.+)$/gm);
    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      if (currentChunk.length + section.length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += section + '\n\n';
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Build the raw requirement text exactly as `process()` does, so external
   * callers (e.g. the orchestrator computing a result-cache key) hash the same
   * bytes. Single source of truth for the requirement payload.
   */
  buildRawText(input: TestCaseInput): string {
    return [
      input.userStory,
      input.acceptanceCriteria,
      input.businessRules,
    ].filter(Boolean).join('\n\n');
  }

  /**
   * Full SHA-256 of cleaned requirement text — the canonical requirement
   * identity. Used by both the requirement cache and the result-cache key fold,
   * so the two never skew.
   */
  private hashCleaned(cleanedText: string): string {
    return crypto.createHash('sha256').update(cleanedText).digest('hex');
  }

  /**
   * Public hash of a requirement input (clean → sha256). Identical to the hash
   * `process()` computes internally, guaranteeing cache-key parity.
   */
  hashRequirement(input: TestCaseInput): string {
    return this.hashCleaned(this.cleanInput(this.buildRawText(input)));
  }

  /**
   * Stages 2-6, 9: AI-Powered Requirement Analysis
   * Combines segmentation, classification, entity extraction,
   * missing info detection, enhancement, and scoring into one call
   */
  async analyzeRequirement(cleanedText: string, input: TestCaseInput): Promise<Partial<ProcessedRequirement>> {
    const systemPrompt = `You are a Senior Business Analyst and QA Architect with 20 years of experience.

Your task is to thoroughly analyze a software requirement and produce a structured, QA-ready analysis.

Perform ALL of the following:

1. SEGMENTATION: Break the requirement into logical sections (user story, acceptance criteria, business rules, permissions, validations, dependencies, notifications, audit logs, API requirements, UI requirements).

2. CLASSIFICATION: Identify the module and feature being tested.

3. ENTITY EXTRACTION: Extract all actors, data fields (with types and validation rules), permissions, and business rules.

4. MISSING INFO DETECTION: Identify what's ambiguous, unclear, or missing that would impact testing.

5. ENHANCEMENT: Infer reasonable assumptions to fill gaps.

6. SCORING: Rate the requirement on completeness (0-100), clarity (0-100), and QA readiness (0-100).

Return ONLY valid JSON with this exact structure:
{
  "module": "Module name (e.g., Role Management)",
  "feature": "Specific feature (e.g., Create Role)",
  "userStory": "Clean user story in As a... I want... so that... format",
  "acceptanceCriteria": ["List of acceptance criteria"],
  "businessRules": ["List of business rules"],
  "permissions": ["List of required permissions"],
  "validations": ["List of input validations"],
  "dependencies": ["List of dependencies"],
  "notifications": ["List of notification requirements"],
  "auditLogs": ["List of audit log requirements"],
  "apiRequirements": ["List of API requirements if any"],
  "uiRequirements": ["List of UI requirements if any"],
  "actors": ["List of user roles/actors"],
  "fields": [
    {
      "name": "Field name",
      "type": "data type",
      "rules": ["validation rules"],
      "validations": ["testable validations"]
    }
  ],
  "missingInfo": ["What's unclear or missing"],
  "assumptions": ["Reasonable assumptions made"],
  "contradictions": ["Any contradictions found"],
  "scores": {
    "completeness": 0-100,
    "clarity": 0-100,
    "qaReadiness": 0-100
  }
}

Be thorough and critical. Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Analyze this requirement:

${input.moduleName ? `Module Hint: ${input.moduleName}` : ''}
${input.featureName ? `Feature Hint: ${input.featureName}` : ''}

Requirement Text:
${cleanedText}`;

    const { content } = await aiProviderManager.generate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return parseAiJsonSafe<Partial<ProcessedRequirement>>(content, {
      module: input.moduleName || 'General',
      feature: input.featureName || 'Feature',
      userStory: cleanedText.substring(0, 200),
      acceptanceCriteria: [],
      businessRules: [],
      permissions: [],
      validations: [],
      dependencies: [],
      notifications: [],
      auditLogs: [],
      apiRequirements: [],
      uiRequirements: [],
      actors: ['User'],
      fields: [],
      missingInfo: [],
      assumptions: [],
      contradictions: [],
      scores: { completeness: 50, clarity: 50, qaReadiness: 50 },
    });
  }

  /**
   * Stage 7 & 10: Markdown Normalization
   * Converts the processed requirement into standardized markdown
   */
  normalizeToMarkdown(req: Partial<ProcessedRequirement>): string {
    const sections: string[] = [];

    sections.push(`# Module\n${req.module || 'General'}`);
    sections.push(`# Feature\n${req.feature || 'Feature'}`);

    if (req.userStory) {
      sections.push(`# User Story\n${req.userStory}`);
    }

    if (req.actors && req.actors.length > 0) {
      sections.push(`# Actors\n${req.actors.map(a => `- ${a}`).join('\n')}`);
    }

    if (req.permissions && req.permissions.length > 0) {
      sections.push(`# Permissions\n${req.permissions.map(p => `- ${p}`).join('\n')}`);
    }

    if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
      sections.push(`# Acceptance Criteria\n${req.acceptanceCriteria.map(a => `- ${a}`).join('\n')}`);
    }

    if (req.validations && req.validations.length > 0) {
      sections.push(`# Validations\n${req.validations.map(v => `- ${v}`).join('\n')}`);
    }

    if (req.businessRules && req.businessRules.length > 0) {
      sections.push(`# Business Rules\n${req.businessRules.map(b => `- ${b}`).join('\n')}`);
    }

    if (req.fields && req.fields.length > 0) {
      const fieldsText = req.fields.map(f =>
        `- **${f.name}** (${f.type}): ${f.rules?.join(', ') || 'No rules'}`
      ).join('\n');
      sections.push(`# Fields\n${fieldsText}`);
    }

    if (req.dependencies && req.dependencies.length > 0) {
      sections.push(`# Dependencies\n${req.dependencies.map(d => `- ${d}`).join('\n')}`);
    }

    if (req.notifications && req.notifications.length > 0) {
      sections.push(`# Notifications\n${req.notifications.map(n => `- ${n}`).join('\n')}`);
    }

    if (req.auditLogs && req.auditLogs.length > 0) {
      sections.push(`# Audit Logs\n${req.auditLogs.map(a => `- ${a}`).join('\n')}`);
    }

    if (req.apiRequirements && req.apiRequirements.length > 0) {
      sections.push(`# API Requirements\n${req.apiRequirements.map(a => `- ${a}`).join('\n')}`);
    }

    if (req.uiRequirements && req.uiRequirements.length > 0) {
      sections.push(`# UI Requirements\n${req.uiRequirements.map(u => `- ${u}`).join('\n')}`);
    }

    if (req.missingInfo && req.missingInfo.length > 0) {
      sections.push(`# Missing Information\n${req.missingInfo.map(m => `- ${m}`).join('\n')}`);
    }

    if (req.assumptions && req.assumptions.length > 0) {
      sections.push(`# Assumptions\n${req.assumptions.map(a => `- ${a}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Convert ProcessedRequirement to ParsedRequirement format
   * for compatibility with the existing multi-agent system
   */
  toParsedRequirement(req: ProcessedRequirement): ParsedRequirement {
    return {
      module: req.module,
      feature: req.feature,
      actors: req.actors,
      permissions: req.permissions,
      fields: req.fields,
      constraints: [...req.businessRules, ...req.validations],
      validations: req.validations,
      businessRules: req.businessRules,
      dependencies: req.dependencies,
      missingInfo: req.missingInfo,
      workflows: req.acceptanceCriteria,
    };
  }

  /**
   * Complete Processing Pipeline
   * Runs all stages and returns the final AI-ready requirement
   * 
   * OPTIMIZED: Skips AI analysis (Stage 3) for speed - agents handle raw text well
   */
  async process(input: TestCaseInput): Promise<ProcessedRequirement> {
    const rawText = this.buildRawText(input);

    // Stage 1: Input Cleanup (programmatic, instant)
    logger.info('🧹 Stage 1: Cleaning input...');
    const cleanedText = this.cleanInput(rawText);

    // Requirement-hash cache: skip the Phase-1 AI analysis entirely on a repeat
    // requirement (bottleneck B7). The hash is the canonical requirement identity.
    const reqHash = this.hashCleaned(cleanedText);
    const cached = requirementCache.get<ProcessedRequirement>(reqHash);
    if (cached) {
      logger.info('💾 Requirement cache HIT — skipping AI analysis');
      return cached;
    }

    // Programmatic baseline (always available; also the fallback if AI analysis fails).
    const acceptanceCriteria = (input.acceptanceCriteria || '')
      .split('\n').map(s => s.trim()).filter(s => s.length > 0);
    const businessRules = (input.businessRules || '')
      .split('\n').map(s => s.trim()).filter(s => s.length > 0);

    const processed: ProcessedRequirement = {
      module: input.moduleName || 'General',
      feature: input.featureName || input.userStory?.substring(0, 50) || 'Feature',
      userStory: input.userStory || cleanedText.substring(0, 200),
      acceptanceCriteria,
      businessRules,
      permissions: [],
      validations: [],
      dependencies: [],
      notifications: [],
      auditLogs: [],
      apiRequirements: [],
      uiRequirements: [],
      actors: ['User'],
      fields: [],
      missingInfo: [],
      assumptions: [],
      contradictions: [],
      scores: { completeness: 60, clarity: 60, qaReadiness: 60 },
      markdown: '',
      originalLength: rawText.length,
      cleanedLength: cleanedText.length,
      wasChunked: false,
    };

    // AI requirement analysis — extract the discrete, testable requirements (acceptance criteria,
    // business rules, validations, fields + their rules, workflows, permissions, API/UI needs) so
    // generation can be driven by REQUIREMENT COVERAGE rather than a test-type quota. Falls back to
    // the programmatic baseline above on any failure.
    try {
      logger.info('🧠 Analyzing requirement (extracting testable requirements)...');
      const analyzed = await this.analyzeRequirement(cleanedText, input);
      const nonEmpty = (arr?: string[]) => (arr && arr.length > 0 ? arr : undefined);
      processed.module = analyzed.module || processed.module;
      processed.feature = analyzed.feature || processed.feature;
      processed.userStory = analyzed.userStory || processed.userStory;
      processed.acceptanceCriteria = nonEmpty(analyzed.acceptanceCriteria) || acceptanceCriteria;
      processed.businessRules = nonEmpty(analyzed.businessRules) || businessRules;
      processed.permissions = analyzed.permissions ?? [];
      processed.validations = analyzed.validations ?? [];
      processed.dependencies = analyzed.dependencies ?? [];
      processed.notifications = analyzed.notifications ?? [];
      processed.auditLogs = analyzed.auditLogs ?? [];
      processed.apiRequirements = analyzed.apiRequirements ?? [];
      processed.uiRequirements = analyzed.uiRequirements ?? [];
      processed.actors = nonEmpty(analyzed.actors) || processed.actors;
      processed.fields = analyzed.fields ?? [];
      processed.missingInfo = analyzed.missingInfo ?? [];
      processed.assumptions = analyzed.assumptions ?? [];
      processed.contradictions = analyzed.contradictions ?? [];
      processed.scores = analyzed.scores ?? processed.scores;
      logger.info(`✅ Requirement analyzed — ${processed.acceptanceCriteria.length} AC, ${processed.businessRules.length} BR, ${processed.fields.length} fields`);
    } catch (e: any) {
      logger.warn('⚠️ Requirement AI analysis failed, using programmatic baseline', { message: e?.message || String(e) });
    }

    // Stage 7 & 10: Normalize to markdown (programmatic, instant) — the prompt covers every section.
    logger.info('📝 Stage 7, 10: Normalizing to markdown...');
    processed.markdown = this.normalizeToMarkdown(processed);

    // Cache the canonical processed requirement (held here); callers receive a
    // fresh deep clone so the cached entry can never be mutated downstream.
    requirementCache.set(reqHash, processed);

    logger.info(`✅ Requirement processed: ${processed.scores.qaReadiness}% QA Ready`);

    return structuredClone(processed);
  }
}

export default new RequirementProcessorService();
