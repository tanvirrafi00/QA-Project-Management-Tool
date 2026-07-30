'use client';

/**
 * TestGeneratorClient - Orchestrates the 3-step wizard flow
 *
 * Step 1: Input Requirement  (full-width form)
 * Step 2: Processing         (animated AI thinking screen)
 * Step 3: Review Results     (full-width results with KPI cards + table)
 */

import { TestInputForm } from '@/features/test-case-generator/components/TestInputForm';
import { TestResultsView } from '@/features/test-case-generator/components/TestResultsView';
import { ProcessingScreen } from '@/features/test-case-generator/components/ProcessingScreen';
import { WizardSteps } from '@/features/test-case-generator/components/WizardSteps';
import { useTestGenerator } from '@/features/test-case-generator/hooks/useTestGenerator';
import { TestCaseInput } from '@/features/test-case-generator/types';

export function TestGeneratorClient() {
  const {
    step,
    formData,
    updateFormField,
    isGenerating,
    error,
    result,
    job,
    showOptional,
    currentTipIndex,
    setShowOptional,
    handleSubmit,
    cancelGeneration,
    handleSave,
    saveStatus,
    saveResult,
    saveError,
    clearError,
    goToInput,
    reset,
  } = useTestGenerator();

  // Input field change handler wrapper (supports string | number | string[] for the steering fields)
  const handleFormFieldChange = (field: string, value: string | number | string[]) => {
    clearError();
    updateFormField(field as keyof TestCaseInput, value);
  };

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 64px)' }}>
      {/* Wizard Step Indicator */}
      <WizardSteps currentStep={step} />

      {/* Step Content — full width */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 var(--spacing-6) var(--spacing-8)' }}>
        {step === 'input' && (
          <TestInputForm
            formData={formData}
            showOptional={showOptional}
            error={error}
            currentTipIndex={currentTipIndex}
            isGenerating={isGenerating}
            onFormFieldChange={handleFormFieldChange}
            onToggleOptional={() => setShowOptional(!showOptional)}
            onSubmit={handleSubmit}
          />
        )}

        {step === 'processing' && (
          <ProcessingScreen
            projectName={formData.projectName}
            module={formData.module}
            snapshot={job}
            onCancel={cancelGeneration}
            hasSecondary={
              // Functional-only selection (or none → "all") => secondary phases will run. Hide them
              // only when the user explicitly picked functional alone, so we never promise a step
              // that won't run. (Only affects the pre-snapshot simulation fallback.)
              !formData.testTypes || formData.testTypes.length === 0
                ? true
                : formData.testTypes.some((t) => t !== 'functional')
            }
          />
        )}

        {step === 'results' && result && (
          <TestResultsView
            result={result}
            onBackToInput={goToInput}
            onReset={reset}
            onSave={handleSave}
            saveStatus={saveStatus}
            saveResult={saveResult}
            saveError={saveError}
          />
        )}
      </div>
    </div>
  );
}
