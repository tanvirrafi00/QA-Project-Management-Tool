'use client';

import { useState } from 'react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { CustomSelect } from '@/components/ui/CustomSelect';
import {
  Bug, Sparkles, Loader2, FileDown, Copy, Check,
  AlertTriangle, Search, FileText, Terminal, ClipboardList,
  Monitor, Server, Layers, Smartphone, Database, Plus, RefreshCw,
  Pencil, Eye, Target, Wrench, Tag, ShieldAlert, Activity,
} from 'lucide-react';
import { bugService } from '@/features/bug-management/services/bug.service';
import {
  BugLayer, BugSeverity, BugPriority, BugStatus, InputMethod,
  BugGenerationResult, AIBugReport,
} from '@/features/bug-management/types';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';

const LAYERS: { value: BugLayer; label: string; icon: typeof Monitor; color: string }[] = [
  { value: 'Frontend', label: 'Frontend', icon: Monitor, color: '#3B82F6' },
  { value: 'Backend', label: 'Backend', icon: Server, color: '#8B5CF6' },
  { value: 'Integration', label: 'Integration', icon: Layers, color: '#06B6D4' },
  { value: 'Mobile', label: 'Mobile', icon: Smartphone, color: '#F97316' },
  { value: 'Infrastructure', label: 'Infrastructure', icon: Database, color: '#64748B' },
];
const SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITIES: BugPriority[] = ['P1', 'P2', 'P3', 'P4'];
const STATUSES: BugStatus[] = ['Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed'];

export default function BugGeneratorPage() {
  // This module owns its own project selection (per-module, persisted) — see useModuleProject.
  // Generation is blocked until a real project is selected (never a fabricated/stale name).
  const { projects, selectedProjectName, setSelectedProject, loading: projectsLoading } = useModuleProject('bug-generator');
  const project = selectedProjectName;
  const toast = useToast();

  const [layer, setLayer] = useState<BugLayer>('Backend');
  const [inputMethod, setInputMethod] = useState<InputMethod>('description');
  const [reporter, setReporter] = useState('QA Team');
  const [assignee, setAssignee] = useState('Unassigned');
  const [status, setStatus] = useState<BugStatus>('Open');

  // Input state
  const [description, setDescription] = useState('');
  const [structuredModule, setStructuredModule] = useState('');
  const [structuredExpected, setStructuredExpected] = useState('');
  const [structuredActual, setStructuredActual] = useState('');
  const [structuredSteps, setStructuredSteps] = useState('');
  const [logs, setLogs] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<BugGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable report state
  const [report, setReport] = useState<AIBugReport | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Handlers ──────────────────────────────────────

  const handleGenerate = async () => {
    // A real project is required — never generate for a fabricated/stale name.
    if (!project) {
      setError('Please select a project first.');
      return;
    }
    // Validate input
    if (inputMethod === 'description' && !description.trim()) {
      setError('Please describe the issue');
      return;
    }
    if (inputMethod === 'log' && !logs.trim()) {
      setError('Please paste the logs');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenResult(null);
    setReport(null);
    setIsEditing(false);

    try {
      const result = await bugService.generateBug({
        projectName: project,
        layer,
        inputMethod,
        description: inputMethod === 'description' ? description : undefined,
        module: inputMethod === 'structured' ? structuredModule : undefined,
        expectedResult: inputMethod === 'structured' ? structuredExpected : undefined,
        actualResult: inputMethod === 'structured' ? structuredActual : undefined,
        steps: inputMethod === 'structured' ? structuredSteps : undefined,
        logs: inputMethod === 'log' ? logs : undefined,
      });

      if (result.success && result.data) {
        setGenResult(result.data);
        setReport({ ...result.data.report });
      } else {
        setError(result.error || 'Failed to generate bug report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (createAnother: boolean = false) => {
    if (!report || !genResult || !project) return;

    setIsSaving(true);

    try {
      const result = await bugService.saveBug({
        bugId: genResult.bugId,
        projectName: project,
        layer,
        title: report.title,
        description: report.description,
        module: report.module,
        severity: report.severity,
        priority: report.priority,
        status,
        environment: report.environment,
        precondition: report.precondition,
        currentBehavior: report.currentBehavior,
        stepsToReproduce: report.stepsToReproduce,
        expectedResult: report.expectedResult,
        actualResult: report.actualResult,
        impact: report.impact,
        reporter,
        assignee,
        possibleRootCause: report.possibleRootCause,
        suggestedFix: report.suggestedFix,
        similarBugs: report.similarBugs,
        missingInfo: report.missingInfo,
        tags: report.tags,
        aiConfidence: report.aiConfidence,
      });

      if (result.success && result.data) {
        toast.success(`${result.data.bugId} saved successfully.`, { description: 'Visible in Bug Dashboard & List.' });

        if (createAnother) {
          // Reset for new bug
          setDescription('');
          setStructuredModule('');
          setStructuredExpected('');
          setStructuredActual('');
          setStructuredSteps('');
          setLogs('');
          setStatus('Open');
          setGenResult(null);
          setReport(null);
        }
      } else {
        setError(result.error || 'Failed to save bug');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!report || !genResult || !project) return;
    const md = `# ${report.title}

**Bug ID:** ${genResult.bugId}
**Project:** ${project}
**Layer:** ${layer}
**Module:** ${report.module}
**Severity:** ${report.severity}
**Priority:** ${report.priority}
**Status:** ${status}
**Reporter:** ${reporter}
**Assignee:** ${assignee}
**Environment:** ${report.environment}
**Tags:** ${report.tags.join(', ')}

## Description
${report.description}

## Current Behavior
${(report.currentBehavior || []).join('\n')}

## Preconditions
${report.precondition}

## Steps to Reproduce
${report.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Expected Result
${report.expectedResult}

## Actual Result
${report.actualResult}

## Impact
${report.impact}

## Possible Root Cause
${report.possibleRootCause}

## Suggested Fix
${report.suggestedFix}
`;
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (!report || !genResult || !project) return;
    const content = `Bug ID: ${genResult.bugId}\nTitle: ${report.title}\nProject: ${project}\nLayer: ${layer}\nModule: ${report.module}\nSeverity: ${report.severity}\nPriority: ${report.priority}\nStatus: ${status}\nReporter: ${reporter}\nAssignee: ${assignee}\nEnvironment: ${report.environment}\nTags: ${report.tags.join(', ')}\n\nDescription:\n${report.description}\n\nCurrent Behavior:\n${(report.currentBehavior || []).join('\n')}\n\nPreconditions:\n${report.precondition}\n\nSteps to Reproduce:\n${report.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExpected Result:\n${report.expectedResult}\n\nActual Result:\n${report.actualResult}\n\nImpact:\n${report.impact}\n\nPossible Root Cause:\n${report.possibleRootCause}\n\nSuggested Fix:\n${report.suggestedFix}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${genResult.bugId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateReport = (field: keyof AIBugReport, value: any) => {
    if (!report) return;
    setReport({ ...report, [field]: value });
  };

  // ── Render ────────────────────────────────────────

  return (
    <AppShell>
      <PageContainer>
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Bug Generator</h1>
            <p className="text-sm text-[#64748B] mt-1">AI-powered professional bug report creation</p>
          </div>

          {/* Error (global inline Alert design) */}
          {error && (
            <Alert type="error" title={error} onDismiss={() => setError(null)} />
          )}

          {/* Section 1: Project & Layer Selection */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
            <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wider mb-4">Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Project — this module's own selection */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Project <span className="text-[#EF4444]">*</span>
                </label>
                <ModuleProjectSelector
                  projects={projects}
                  value={selectedProjectName}
                  onChange={setSelectedProject}
                  loading={projectsLoading}
                />
              </div>

              {/* Layer */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Bug Layer <span className="text-[#EF4444]">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {LAYERS.map(l => {
                    const Icon = l.icon;
                    return (
                      <button
                        key={l.value}
                        onClick={() => setLayer(l.value)}
                        className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-all ${layer === l.value
                          ? 'text-white shadow-sm'
                          : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'
                          }`}
                        style={layer === l.value ? { background: l.color } : {}}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Assignment Row: Reporter, Assignee, Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {/* Reporter */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Reporter</label>
                <input
                  value={reporter}
                  onChange={e => setReporter(e.target.value)}
                  placeholder="e.g., Tanvir, Rafi"
                  className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Assignee</label>
                <input
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  placeholder="e.g., Dev A, Dev B"
                  className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Status</label>
                <CustomSelect
                  options={STATUSES.map(s => ({ value: s, label: s }))}
                  value={status}
                  onChange={v => setStatus(v as BugStatus)}
                  height={44}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Input Method */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-xl p-1 w-fit mb-5">
              <InputTab active={inputMethod === 'description'} onClick={() => setInputMethod('description')} icon={<FileText className="w-4 h-4" />}>
                Description
              </InputTab>
              <InputTab active={inputMethod === 'structured'} onClick={() => setInputMethod('structured')} icon={<ClipboardList className="w-4 h-4" />}>
                Structured Input
              </InputTab>
              <InputTab active={inputMethod === 'log'} onClick={() => setInputMethod('log')} icon={<Terminal className="w-4 h-4" />}>
                Log Analysis
              </InputTab>
            </div>

            {/* Description Input */}
            {inputMethod === 'description' && (
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Describe the Issue</label>
                <AutoResizeTextarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="When creating a role with an existing name, the system creates duplicate roles instead of showing validation..."
                  minRows={4}
                  maxRows={14}
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                />
                <p className="text-xs text-[#94A3B8] mt-1.5">{description.length} characters</p>
              </div>
            )}

            {/* Structured Input */}
            {inputMethod === 'structured' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Module</label>
                  <input
                    value={structuredModule}
                    onChange={e => setStructuredModule(e.target.value)}
                    placeholder="e.g., Role Management"
                    className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Steps</label>
                  <AutoResizeTextarea
                    value={structuredSteps}
                    onChange={e => setStructuredSteps(e.target.value)}
                    placeholder="1. Login as Admin&#10;2. Navigate to Role Management&#10;3. Create role..."
                    minRows={3}
                    maxRows={12}
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Expected Result</label>
                  <AutoResizeTextarea
                    value={structuredExpected}
                    onChange={e => setStructuredExpected(e.target.value)}
                    placeholder="System should show validation error..."
                    minRows={2}
                    maxRows={10}
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Actual Result</label>
                  <AutoResizeTextarea
                    value={structuredActual}
                    onChange={e => setStructuredActual(e.target.value)}
                    placeholder="Duplicate role created successfully..."
                    minRows={2}
                    maxRows={10}
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                  />
                </div>
              </div>
            )}

            {/* Log Analysis */}
            {inputMethod === 'log' && (
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">Paste Logs / Error Output</label>
                <AutoResizeTextarea
                  value={logs}
                  onChange={e => setLogs(e.target.value)}
                  placeholder={`[ERROR] 2024-01-15 10:23:45 - Database connection failed\n[WARN] Connection pool exhausted\n[STACK] at RoleService.create (role.service.ts:45)`}
                  minRows={6}
                  maxRows={20}
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm font-mono text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4] bg-[#F8FAFC]"
                />
              </div>
            )}

            {/* Generate Button */}
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !project}
                size="md"
                className="bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] text-white hover:opacity-90"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing Issue...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Bug Report
                  </>
                )}
              </Button>
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
                    Detecting Module
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" />
                    Determining Severity
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                    Generating Report
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: AI Generated Bug Report */}
          {report && genResult && (
            <>
              {/* ═══ JIRA-STYLE REPORT CARD ═══ */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-sm">

                {/* ── Dark Header Bar ── */}
                <div className="px-6 py-4 bg-gradient-to-r from-[#0F172A] to-[#1E293B] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#3B82F6] flex items-center justify-center">
                    <Bug className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">AI Generated Bug Report</h3>
                    <p className="text-xs text-[#94A3B8]">{genResult.bugId} • AI Confidence: {report.aiConfidence}%</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-all ${isEditing
                        ? 'bg-white text-[#0F172A]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                    >
                      {isEditing ? <><Eye className="w-3.5 h-3.5" /> View</> : <><Pencil className="w-3.5 h-3.5" /> Edit</>}
                    </button>
                  </div>
                </div>

                {/* ═══ READ MODE (Jira-style) ═══ */}
                {!isEditing && (
                  <div className="p-0">
                    {/* ── Title / Summary ── */}
                    <div className="px-6 pt-6 pb-4 border-b border-[#F1F5F9]">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mt-1">Title / Summary</span>
                      </div>
                      <h2 className="text-xl font-bold text-[#0F172A] leading-snug">{report.title}</h2>
                      {/* Metadata Badges */}
                      <div className="flex items-center gap-2 flex-wrap mt-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white" style={{ background: severityColor(report.severity) }}>
                          <ShieldAlert className="w-3 h-3" /> {report.severity}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0F172A] text-white">
                          <Target className="w-3 h-3" /> {report.priority}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                          {report.module}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: LAYERS.find(l => l.value === layer)?.color + '20', color: LAYERS.find(l => l.value === layer)?.color }}>
                          {layer}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                          {status}
                        </span>
                      </div>
                    </div>

                    {/* ── Two-column: Main Content + Sidebar ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">

                      {/* ▓▓ Main Content (2/3) ▓▓ */}
                      <div className="lg:col-span-2 p-6 space-y-6 lg:border-r border-[#F1F5F9]">

                        {/* Description */}
                        <div>
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                            <FileText className="w-3.5 h-3.5" /> Description
                          </h4>
                          <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{report.description}</p>
                        </div>

                        {/* Current Behavior */}
                        {report.currentBehavior && report.currentBehavior.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                              <Activity className="w-3.5 h-3.5" /> Current Behavior
                            </h4>
                            <div className="space-y-1.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4">
                              {report.currentBehavior.map((item, i) => {
                                const isFail = item.includes('❌');
                                const isPass = item.includes('✔️');
                                const cleanText = item.replace(/^[✔️❌✅✗]\s*/, '').trim();
                                return (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <span className="flex-shrink-0 mt-0.5">
                                      {isFail ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#EF4444]/10 text-[#EF4444] text-xs font-bold">✕</span>
                                      ) : isPass ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#22C55E]/10 text-[#22C55E] text-xs font-bold">✓</span>
                                      ) : (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E2E8F0] text-[#64748B] text-xs">•</span>
                                      )}
                                    </span>
                                    <span className={isFail ? 'text-[#DC2626] font-medium' : isPass ? 'text-[#16A34A]' : 'text-[#1E293B]'}>
                                      {cleanText}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Steps to Reproduce */}
                        <div>
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                            <ClipboardList className="w-3.5 h-3.5" /> Steps to Reproduce
                          </h4>
                          <ol className="space-y-2">
                            {report.stepsToReproduce.map((step, i) => (
                              <li key={i} className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                <span className="text-sm text-[#1E293B] leading-relaxed pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        {/* Expected vs Actual */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl p-4 bg-[#F0FDF4] border border-[#22C55E]/30">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#166534] uppercase tracking-wider mb-2">
                              <Check className="w-3.5 h-3.5" /> Expected Result
                            </h4>
                            <p className="text-sm text-[#1E293B] leading-relaxed">{report.expectedResult}</p>
                          </div>
                          <div className="rounded-xl p-4 bg-[#FEF2F2] border border-[#EF4444]/30">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#991B1B] uppercase tracking-wider mb-2">
                              <AlertTriangle className="w-3.5 h-3.5" /> Actual Result
                            </h4>
                            <p className="text-sm text-[#1E293B] leading-relaxed">{report.actualResult}</p>
                          </div>
                        </div>

                        {/* Impact */}
                        <div>
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                            <AlertTriangle className="w-3.5 h-3.5" /> Impact
                          </h4>
                          <p className="text-sm text-[#1E293B] leading-relaxed">{report.impact}</p>
                        </div>

                        {/* AI Insights */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl p-4 bg-[#FFFBEB] border border-[#F59E0B]/30">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#92400E] uppercase tracking-wider mb-2">
                              <Search className="w-3.5 h-3.5" /> Possible Root Cause
                            </h4>
                            <p className="text-sm text-[#1E293B] leading-relaxed">{report.possibleRootCause}</p>
                          </div>
                          <div className="rounded-xl p-4 bg-[#EFF6FF] border border-[#3B82F6]/30">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#1E40AF] uppercase tracking-wider mb-2">
                              <Wrench className="w-3.5 h-3.5" /> Suggested Fix
                            </h4>
                            <p className="text-sm text-[#1E293B] leading-relaxed">{report.suggestedFix}</p>
                          </div>
                        </div>
                      </div>

                      {/* ▓▓ Sidebar (1/3) ▓▓ */}
                      <div className="p-6 space-y-4 bg-[#FAFBFC]">
                        {/* Properties */}
                        <div>
                          <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">Properties</h4>
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Project</span>
                              <span className="text-xs font-medium text-[#1E293B]">{project}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Module</span>
                              <span className="text-xs font-medium text-[#1E293B]">{report.module}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Environment</span>
                              <span className="text-xs font-medium text-[#1E293B]">{report.environment}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Precondition</span>
                              <span className="text-xs font-medium text-[#1E293B] text-right max-w-[60%]">{report.precondition}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Reporter</span>
                              <span className="text-xs font-medium text-[#1E293B]">{reporter}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[#94A3B8]">Assignee</span>
                              <span className="text-xs font-medium text-[#1E293B]">{assignee}</span>
                            </div>
                          </div>
                        </div>

                        {/* Tags */}
                        {report.tags.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                              <Tag className="w-3.5 h-3.5" /> Tags
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {report.tags.map((tag, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-md text-xs font-medium bg-[#F0FDFA] text-[#0F766E] border border-[#06B6D4]/20">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Similar Bugs */}
                        {report.similarBugs.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                              <Bug className="w-3.5 h-3.5" /> Similar Bugs
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {report.similarBugs.map(b => (
                                <span key={b} className="px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-white text-[#3B82F6] border border-[#3B82F6]/20">{b}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing Info */}
                        {report.missingInfo.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#EF4444] uppercase tracking-wider mb-2">
                              <AlertTriangle className="w-3.5 h-3.5" /> Missing Info
                            </h4>
                            <ul className="space-y-1">
                              {report.missingInfo.map((info, i) => (
                                <li key={i} className="text-xs text-[#64748B] flex items-start gap-1.5">
                                  <span className="text-[#EF4444] mt-0.5">•</span>
                                  {info}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ EDIT MODE ═══ */}
                {isEditing && (
                  <div className="p-6 space-y-6">

                    {/* ── Section: Summary ── */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <FileText className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Summary</h4>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Title</label>
                        <input
                          value={report.title}
                          onChange={e => updateReport('title', e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-semibold text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4] focus:shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Description</label>
                        <AutoResizeTextarea
                          value={report.description}
                          onChange={e => updateReport('description', e.target.value)}
                          minRows={3}
                          maxRows={12}
                          className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4] focus:shadow-sm"
                          placeholder="A summary of the bug..."
                        />
                      </div>
                    </div>

                    {/* ── Section: Classification ── */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <ShieldAlert className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Classification</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Severity */}
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Severity</label>
                          <div className="flex gap-1.5">
                            {SEVERITIES.map(s => (
                              <button
                                key={s}
                                onClick={() => updateReport('severity', s)}
                                className={`flex-1 h-10 rounded-lg text-xs font-medium transition-all ${report.severity === s
                                  ? 'text-white shadow-sm'
                                  : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'
                                  }`}
                                style={report.severity === s ? { background: severityColor(s) } : {}}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Priority */}
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Priority</label>
                          <div className="flex gap-1.5">
                            {PRIORITIES.map(p => (
                              <button
                                key={p}
                                onClick={() => updateReport('priority', p)}
                                className={`flex-1 h-10 rounded-lg text-xs font-medium transition-all ${report.priority === p
                                  ? 'bg-[#0F172A] text-white shadow-sm'
                                  : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'
                                  }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Module */}
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Module</label>
                          <input
                            value={report.module}
                            onChange={e => updateReport('module', e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                          />
                        </div>
                        {/* Environment */}
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Environment</label>
                          <input
                            value={report.environment}
                            onChange={e => updateReport('environment', e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                            placeholder="e.g., Production, Staging"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Section: Current Behavior ── */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <Activity className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Current Behavior</h4>
                        <span className="text-xs text-[#94A3B8] normal-case font-normal ml-1">(prefix with ✔️ or ❌)</span>
                      </div>
                      <div className="space-y-2">
                        {report.currentBehavior.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 group">
                            <input
                              value={item}
                              onChange={e => {
                                const newArr = [...report.currentBehavior];
                                newArr[i] = e.target.value;
                                updateReport('currentBehavior', newArr);
                              }}
                              className="flex-1 h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                            />
                            <button
                              onClick={() => updateReport('currentBehavior', report.currentBehavior.filter((_, idx) => idx !== i))}
                              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateReport('currentBehavior', [...report.currentBehavior, '❌ '])}
                          className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:text-[#0891B2] hover:bg-[#06B6D4]/8 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add behavior item
                        </button>
                      </div>
                    </div>

                    {/* ── Section: Steps to Reproduce ── */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <ClipboardList className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Steps to Reproduce</h4>
                      </div>
                      <div className="space-y-2">
                        {report.stepsToReproduce.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 group">
                            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                            <input
                              value={step}
                              onChange={e => {
                                const newSteps = [...report.stepsToReproduce];
                                newSteps[i] = e.target.value;
                                updateReport('stepsToReproduce', newSteps);
                              }}
                              className="flex-1 h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                            />
                            <button
                              onClick={() => updateReport('stepsToReproduce', report.stepsToReproduce.filter((_, idx) => idx !== i))}
                              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateReport('stepsToReproduce', [...report.stepsToReproduce, ''])}
                          className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:text-[#0891B2] hover:bg-[#06B6D4]/8 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add step
                        </button>
                      </div>
                    </div>

                    {/* ── Section: Results & Impact ── */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <Target className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Results & Impact</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Expected Result</label>
                          <AutoResizeTextarea
                            value={report.expectedResult}
                            onChange={e => updateReport('expectedResult', e.target.value)}
                            minRows={2}
                            maxRows={10}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F0FDF4]/50 text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]/30 focus:border-[#22C55E]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Actual Result</label>
                          <AutoResizeTextarea
                            value={report.actualResult}
                            onChange={e => updateReport('actualResult', e.target.value)}
                            minRows={2}
                            maxRows={10}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#FEF2F2]/50 text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EF4444]/30 focus:border-[#EF4444]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Impact</label>
                        <AutoResizeTextarea
                          value={report.impact}
                          onChange={e => updateReport('impact', e.target.value)}
                          minRows={2}
                          maxRows={8}
                          className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Possible Root Cause</label>
                          <AutoResizeTextarea
                            value={report.possibleRootCause}
                            onChange={e => updateReport('possibleRootCause', e.target.value)}
                            minRows={2}
                            maxRows={8}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#FFFBEB]/50 text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/30 focus:border-[#F59E0B]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1.5">Suggested Fix</label>
                          <AutoResizeTextarea
                            value={report.suggestedFix}
                            onChange={e => updateReport('suggestedFix', e.target.value)}
                            minRows={2}
                            maxRows={8}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#EFF6FF]/50 text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Section: Additional Info ── */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
                        <Tag className="w-4 h-4 text-[#06B6D4]" />
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Additional Info</h4>
                      </div>
                      {/* Preconditions */}
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Preconditions</label>
                        <AutoResizeTextarea
                          value={report.precondition}
                          onChange={e => updateReport('precondition', e.target.value)}
                          minRows={2}
                          maxRows={6}
                          className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]"
                        />
                      </div>
                      {/* Tags */}
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1.5">Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {report.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F0FDFA] text-[#0F766E] border border-[#06B6D4]/20"
                            >
                              {tag}
                              <button
                                onClick={() => {
                                  const newTags = report.tags.filter((_, idx) => idx !== i);
                                  updateReport('tags', newTags);
                                }}
                                className="text-[#94A3B8] hover:text-[#EF4444] transition-colors"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                          <input
                            onKeyDown={e => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                e.preventDefault();
                                updateReport('tags', [...report.tags, e.currentTarget.value.trim()]);
                                e.currentTarget.value = '';
                              }
                            }}
                            className="h-8 px-3 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-xs text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4] w-36 transition-all"
                            placeholder="+ Add tag (Enter)"
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* ── Action Bar ── */}
              <div className="flex items-center justify-between gap-3 flex-wrap p-4 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm">
                {/* Primary Actions */}
                <div className="flex items-center gap-2.5">
                  <Button
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                    variant="success"
                    size="sm"
                    isLoading={isSaving}
                    leftIcon={!isSaving ? <Check className="w-4 h-4" /> : undefined}
                  >
                    Save Bug
                  </Button>
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Save & New
                  </Button>
                </div>

                {/* Secondary Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleExport}
                    variant="ghost"
                    size="sm"
                    leftIcon={<FileDown className="w-4 h-4" />}
                  >
                    Export
                  </Button>
                  <Button
                    onClick={handleCopyMarkdown}
                    variant="ghost"
                    size="sm"
                    leftIcon={copied ? <Check className="w-4 h-4 text-[#22C55E]" /> : <Copy className="w-4 h-4" />}
                  >
                    {copied ? 'Copied!' : 'Copy MD'}
                  </Button>
                  <div className="w-px h-6 bg-[#E2E8F0]" />
                  <Button
                    onClick={() => { setGenResult(null); setReport(null); setIsEditing(false); }}
                    variant="ghost"
                    size="sm"
                    className="text-[#94A3B8] hover:text-[#EF4444]"
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}

// ── Helper Components ─────────────────────────────────

function InputTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-all ${active ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
        }`}
    >
      {icon}
      {children}
    </button>
  );
}

function severityColor(severity: BugSeverity): string {
  const colors: Record<BugSeverity, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#F59E0B',
    Low: '#22C55E',
  };
  return colors[severity];
}
