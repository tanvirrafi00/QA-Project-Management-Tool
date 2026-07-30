'use client';

/**
 * Custom hook for Test Case Generator form logic
 * Handles form state, submission, and result management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { TestCaseInput, TestGenerationResponse, TabId, TestCase, RepositorySaveResult, GenerationJobSnapshot } from '../types';
import { testCaseGeneratorService } from '../services/test-case-generator.service';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { perf, logFrontendTimings } from '../utils/perf';
import { saveCalibration } from '../utils/phase-progress';
import { streamGenerationJob } from '../utils/job-stream';

export type WizardStep = 'input' | 'processing' | 'results';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseTestGeneratorReturn {
  // Wizard step
  step: WizardStep;

  // Form state
  formData: TestCaseInput;
  setFormData: (data: TestCaseInput) => void;
  updateFormField: (field: keyof TestCaseInput, value: string | number | string[]) => void;

  // UI state
  isGenerating: boolean;
  error: string | null;
  result: TestGenerationResponse | null;
  activeTab: TabId;
  showOptional: boolean;
  copiedId: string | null;
  currentTipIndex: number;
  /** Live generation job snapshot (Phase 6) — drives the processing screen's real progress. */
  job: GenerationJobSnapshot | null;

  // Save state (manual save in Step 3)
  saveStatus: SaveStatus;
  saveResult: RepositorySaveResult | null;
  saveError: string | null;

  // Actions
  setActiveTab: (tab: TabId) => void;
  setShowOptional: (show: boolean) => void;
  handleSubmit: () => Promise<void>;
  /** Phase 6 — request cancellation of the in-flight generation job (best-effort). */
  cancelGeneration: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleCopy: (text: string, id: string) => void;
  clearError: () => void;
  goToInput: () => void;
  reset: () => void;
}

const TIPS = [
  'Include acceptance criteria for better coverage',
  'Use Gherkin format (Given/When/Then) for clarity',
  'Be specific about business rules and constraints',
  'Mention edge cases and error scenarios',
];

const INITIAL_FORM_STATE: TestCaseInput = {
  projectName: '',
  module: '',
  subModule: '',
  moduleName: '',
  featureName: '',
  userStory: '',
  acceptanceCriteria: '',
  businessRules: '',
  // Steering controls (Phase 2). testTypes defaults to [] → DTO treats empty as "all".
  minTestCases: 50,
  coverageLevel: 'standard',
  testTypes: [],
};

export function useTestGenerator(): UseTestGeneratorReturn {
  // Seed the project from this module's own selection (per-module, persisted) and keep it in sync.
  const { selectedProjectName } = useModuleProject('test-case-generator');

  // Wizard step
  const [step, setStep] = useState<WizardStep>('input');

  // Form state
  const [formData, setFormData] = useState<TestCaseInput>({
    ...INITIAL_FORM_STATE,
    projectName: selectedProjectName ?? '',
  });

  // Reflect global project changes in the form (unless the user already picked one). This is a
  // legitimate external-state (ProjectContext) → local-form sync, so the set-state-in-effect rule's
  // cascading-render concern does not apply.
  useEffect(() => {
    if (selectedProjectName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(prev => ({ ...prev, projectName: prev.projectName || selectedProjectName }));
    }
  }, [selectedProjectName]);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestGenerationResponse | null>(null);
  // Phase 6: live job snapshot (drives the processing screen) + the in-flight jobId for cancel.
  const [job, setJob] = useState<GenerationJobSnapshot | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [showOptional, setShowOptional] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveResult, setSaveResult] = useState<RepositorySaveResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cycle tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copiedId) {
      const timeout = setTimeout(() => setCopiedId(null), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copiedId]);

  // Update individual form field (string | number | string[] — supports the steering controls)
  const updateFormField = useCallback((field: keyof TestCaseInput, value: string | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Handle form submission — Phase 6 job-based flow: create job → poll → settle.
  const handleSubmit = useCallback(async () => {
    // Phase 1 perf: the click is the start of the client-side journey.
    perf.reset();
    perf.mark('click');

    if (!formData.module?.trim()) {
      setError('Module is required. Please select or enter a module.');
      return;
    }
    if (!formData.userStory.trim()) {
      setError('User story is required');
      return;
    }

    // Transition to processing step immediately for UX feedback
    setStep('processing');
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setJob(null);
    // Reset save state on new generation
    setSaveStatus('idle');
    setSaveResult(null);
    setSaveError(null);

    try {
      // Create the job — the request returns immediately with { jobId, status }; generation
      // runs in the background. We then poll for real per-phase progress (Phase 6).
      perf.mark('fetch-start');
      const createRes = await testCaseGeneratorService.createGenerationJob(formData);
      if (!createRes.success || !createRes.data?.jobId) {
        setError(createRes.error || 'Failed to start generation');
        setStep('input');
        return;
      }
      const jobId = createRes.data.jobId;
      jobIdRef.current = jobId;

      // Phase 7: stream live progress (SSE primary, polling fallback). Resolves with the terminal
      // snapshot, or rejects if the job can't be reached. Each snapshot drives the processing screen.
      const finalSnapshot = await streamGenerationJob(jobId, (s) => setJob(s));
      perf.mark('fetch-end');

      if (finalSnapshot.status === 'COMPLETED' && finalSnapshot.result) {
        const result = finalSnapshot.result;
        // Merge form metadata into the result so the UI can display project/module info
        // (generation no longer auto-saves, so repository data comes from the form)
        const enrichedResult = {
          ...result,
          repository: {
            savedToRepository: false,
            savedCount: 0,
            duplicatesSkipped: 0,
            projectName: formData.projectName || selectedProjectName || '',
            module: formData.module,
            ...(formData.subModule ? { subModule: formData.subModule } : {}),
          },
        };
        setResult(enrichedResult);
        setActiveTab('summary');
        setStep('results');

        // Phase 5: calibrate the next run's progress pacing from this run's real phase timings.
        // Skip cache hits — their totalMs is ~0 and would corrupt the estimate.
        const timings = result.timings;
        if (timings && !timings.cacheHit) {
          saveCalibration(timings.phases ?? {}, timings.totalMs);
        }

        // Phase 1 perf: perceived render time on the next paint after results mount.
        perf.mark('results-set');
        requestAnimationFrame(() => {
          perf.mark('painted');
          logFrontendTimings(
            {
              clickTime: perf.between('click', 'fetch-start'),
              apiWaitTime: perf.between('fetch-start', 'fetch-end'),
              renderTime: perf.between('results-set', 'painted'),
              tableRenderTime: 0,
            },
            timings,
          );
        });
      } else if (finalSnapshot.status === 'FAILED') {
        setError(finalSnapshot.error || 'Failed to generate test cases');
        setStep('input');
      } else {
        // CANCELLED (or any other terminal state)
        setError('Generation cancelled');
        setStep('input');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed unexpectedly');
      setStep('input');
    } finally {
      setIsGenerating(false);
      jobIdRef.current = null;
    }
  }, [formData, selectedProjectName]);

  // Phase 6 — request cancellation of the in-flight job. The polling loop observes CANCELLED on
  // its next tick and settles the UI; this just signals the backend (best-effort, between phases).
  const cancelGeneration = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      await testCaseGeneratorService.cancelGenerationJob(jobId);
    } catch {
      /* best-effort — the polling loop will keep running until the job settles */
    }
  }, []);

  // Handle manual save to repository (Step 3 — user approves)
  const handleSave = useCallback(async () => {
    if (!result || !formData.projectName || !formData.module) return;

    setSaveStatus('saving');
    setSaveError(null);

    try {
      // Flatten the type map into a single array. The backend returns testCases keyed by type
      // (a dynamic map: { functional: [...], security: [...], api: [...], ... }); Object.values
      // flattens every type's array regardless of the keys present.
      const allCases: TestCase[] = Object.values(result.testCases || {}).flat();

      const saveResponse = await testCaseGeneratorService.saveToRepository(
        formData.projectName,
        formData.module,
        formData.subModule,
        allCases
      );

      if (saveResponse.success && saveResponse.data) {
        setSaveResult(saveResponse.data);
        setSaveStatus('saved');
      } else {
        setSaveError(saveResponse.error || 'Failed to save test cases');
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setSaveStatus('error');
    }
  }, [result, formData]);

  // Handle copy to clipboard
  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Go back to input step (keeps form data)
  const goToInput = useCallback(() => {
    setStep('input');
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    setFormData(INITIAL_FORM_STATE);
    setError(null);
    setResult(null);
    setJob(null);
    setActiveTab('summary');
    setShowOptional(false);
    setCopiedId(null);
    setStep('input');
    // Reset save state
    setSaveStatus('idle');
    setSaveResult(null);
    setSaveError(null);
  }, []);

  return {
    // Wizard step
    step,

    // Form state
    formData,
    setFormData,
    updateFormField,

    // UI state
    isGenerating,
    error,
    result,
    job,
    activeTab,
    showOptional,
    copiedId,
    currentTipIndex,

    // Save state
    saveStatus,
    saveResult,
    saveError,

    // Actions
    setActiveTab,
    setShowOptional,
    handleSubmit,
    cancelGeneration,
    handleSave,
    handleCopy,
    clearError,
    goToInput,
    reset,
  };
}
