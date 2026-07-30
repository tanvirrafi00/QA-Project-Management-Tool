'use client';

/**
 * WizardSteps - Step indicator bar for the 3-step Test Case Generator wizard
 *
 * Step 1: Input Requirement  →  Step 2: Processing  →  Step 3: Review Results
 */

import { Check, FileText, Loader2, ListChecks } from 'lucide-react';
import type { WizardStep } from '../hooks/useTestGenerator';

interface WizardStepsProps {
  currentStep: WizardStep;
}

const STEPS: { id: WizardStep; label: string; icon: typeof FileText }[] = [
  { id: 'input', label: 'Input Requirement', icon: FileText },
  { id: 'processing', label: 'Processing', icon: Loader2 },
  { id: 'results', label: 'Review Results', icon: ListChecks },
];

export function WizardSteps({ currentStep }: WizardStepsProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0',
        padding: '20px var(--spacing-6)',
        borderBottom: '1px solid var(--border-subtle, #E2E8F0)',
        background: 'var(--background-primary, #FFFFFF)',
      }}
    >
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isActive = index === currentIndex;
        const Icon = step.icon;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Step Circle + Label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.3s ease',
                  background: isComplete
                    ? '#10B981'
                    : isActive
                      ? 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)'
                      : '#F1F5F9',
                  boxShadow: isActive ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                }}
              >
                {isComplete ? (
                  <Check style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
                ) : isActive && step.id === 'processing' ? (
                  <Loader2 style={{ width: '16px', height: '16px', color: '#FFFFFF', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Icon style={{ width: '15px', height: '15px', color: isActive ? '#FFFFFF' : '#94A3B8' }} />
                )}
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  color: isComplete || isActive ? '#0F172A' : '#94A3B8',
                  transition: 'color 0.3s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < STEPS.length - 1 && (
              <div
                style={{
                  width: '80px',
                  height: '2px',
                  margin: '0 16px',
                  borderRadius: '1px',
                  background: index < currentIndex ? '#10B981' : '#E2E8F0',
                  transition: 'background 0.3s ease',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
