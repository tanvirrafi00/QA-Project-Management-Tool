'use client';

/**
 * TestInputForm - Client component for the test case input form
 * Handles all interactive form elements
 */

import { useEffect, useState } from 'react';
import { Lightbulb, Plus, AlertTriangle, Sparkles, Loader2, FolderTree, Briefcase, GitBranch, Gauge, ListChecks, Hash } from 'lucide-react';
import { TestCaseInput } from '../types';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { CustomSelect, SelectOption } from '@/components/ui/CustomSelect';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/MultiSelect';
import { apiClient } from '@/lib/api-client';
import { useProject } from '@/features/project-management/ProjectContext';

interface TestInputFormProps {
  formData: TestCaseInput;
  showOptional: boolean;
  error: string | null;
  currentTipIndex: number;
  isGenerating: boolean;
  onFormFieldChange: (field: string, value: string | number | string[]) => void;
  onToggleOptional: () => void;
  onSubmit: () => void;
}

const TIPS = [
  'Include acceptance criteria for better coverage',
  'Use Gherkin format (Given/When/Then) for clarity',
  'Be specific about business rules and constraints',
  'Mention edge cases and error scenarios',
];

const TEMPLATE_BUTTONS = ['User Registration', 'Login Flow', 'Password Reset'];

const MIN_CHIPS = [50, 100, 200, 500];

interface GenerationConfig {
  testTypes: MultiSelectOption[];
  coverageLevels: SelectOption[];
  modules: readonly string[];
  customModule: string;
}

export function TestInputForm({
  formData,
  showOptional,
  error,
  currentTipIndex,
  isGenerating,
  onFormFieldChange,
  onToggleOptional,
  onSubmit,
}: TestInputFormProps) {
  // Project options come from the global ProjectContext (the central hub), so newly
  // created projects are immediately selectable here.
  const { projects: activeProjects } = useProject();
  const projectOptions: SelectOption[] = activeProjects.map(p => ({
    value: p.projectName,
    label: p.projectName,
    icon: <Briefcase style={{ width: '14px', height: '14px', color: '#06B6D4' }} />,
  }));

  // Generation options (test types, coverage levels, modules) come from the backend config so the
  // dropdowns are never hardcoded in the page — adding a type/module on the server flows here.
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  useEffect(() => {
    apiClient.get<GenerationConfig>('/api/generate/config').then((res) => {
      if (res.success && res.data) {
        setConfig(res.data);
        // Default test types to "all selected" on first load.
        if (!formData.testTypes || formData.testTypes.length === 0) {
          onFormFieldChange('testTypes', res.data.testTypes.map((t) => t.value));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTemplateClick = (template: string) => {
    const story = `As a user, I want to ${template.toLowerCase().replace(' ', ' ')}, so that I can access the system.`;
    onFormFieldChange('userStory', story);
  };

  // Module is a free-text input — the user types the module name (required).
  const moduleResolved = !!formData.module?.trim();
  const canGenerate =
    !isGenerating &&
    !!formData.userStory.trim() &&
    moduleResolved &&
    (formData.minTestCases ?? 0) > 0;

  return (
    <div style={{
      background: 'var(--background-primary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--spacing-6)',
      boxSizing: 'border-box',
      minHeight: 'fit-content'
    }}>

      {/* Header Section */}
      <div style={{ marginBottom: 'var(--spacing-6)', flexShrink: 0 }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: 'var(--text-primary)',
          marginBottom: 'var(--spacing-2)',
          letterSpacing: '-0.025em'
        }}>
          Requirement Input
        </h2>
        <p style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--text-secondary)',
          lineHeight: '1.5'
        }}>
          Describe your feature or user story. AI agents will generate comprehensive test cases automatically.
        </p>
      </div>

      {/* Project Details Section (Mandatory) */}
      <div style={{
        marginBottom: '24px',
        flexShrink: 0,
        padding: '20px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#0F172A',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <FolderTree style={{ width: '15px', height: '15px', color: '#06B6D4' }} />
          Project Details
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B', marginLeft: '4px' }}>
            (where test cases will be saved)
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          {/* Project */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
              Project <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <CustomSelect
              options={projectOptions}
              value={formData.projectName ?? ''}
              onChange={(val) => onFormFieldChange('projectName', val)}
              placeholder="Select project..."
              accentColor="#06B6D4"
            />
          </div>
          {/* Module — free-text input; the user types the module name (required). */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
              Module <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.module || ''}
              onChange={(e) => onFormFieldChange('module', e.target.value)}
              placeholder="e.g. Authentication, Payments, Checkout…"
              style={{
                width: '100%',
                height: '42px',
                background: '#FFFFFF',
                border: '2px solid #E2E8F0',
                borderRadius: '10px',
                padding: '0 12px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#0F172A',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#06B6D4'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
            />
          </div>
          {/* Sub Module */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
              Sub Module
            </label>
            <div style={{ position: 'relative' }}>
              <GitBranch style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: '#94A3B8',
                pointerEvents: 'none',
                zIndex: 1,
              }} />
              <input
                type="text"
                value={formData.subModule || ''}
                onChange={(e) => onFormFieldChange('subModule', e.target.value)}
                placeholder="e.g. Login (optional)"
                style={{
                  width: '100%',
                  height: '42px',
                  background: '#FFFFFF',
                  border: '2px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '0 12px 0 38px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0F172A',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#06B6D4';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Generation Settings (steering controls) */}
      <div style={{
        marginBottom: '24px',
        flexShrink: 0,
        padding: '20px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#0F172A',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Gauge style={{ width: '15px', height: '15px', color: '#06B6D4' }} />
          Generation Settings
          <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B', marginLeft: '4px' }}>
            (steer how many cases & what coverage)
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          {/* Minimum Test Cases */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Hash style={{ width: '12px', height: '12px', color: '#94A3B8' }} />
              Minimum Test Cases <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={formData.minTestCases ?? 50}
              onChange={(e) => onFormFieldChange('minTestCases', Math.max(1, Number(e.target.value) || 0))}
              style={{
                width: '100%',
                height: '42px',
                background: '#FFFFFF',
                border: '2px solid #E2E8F0',
                borderRadius: '10px',
                padding: '0 12px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#0F172A',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#06B6D4'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
              {MIN_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onFormFieldChange('minTestCases', n)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: formData.minTestCases === n ? '#06B6D4' : '#FFFFFF',
                    color: formData.minTestCases === n ? '#FFFFFF' : '#475569',
                    borderColor: formData.minTestCases === n ? '#06B6D4' : '#E2E8F0',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/* Coverage Level */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
              Coverage Level <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <CustomSelect
              options={config?.coverageLevels ?? []}
              value={formData.coverageLevel ?? 'standard'}
              onChange={(val) => onFormFieldChange('coverageLevel', val)}
              placeholder="Select coverage…"
              accentColor="#06B6D4"
            />
            <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px', lineHeight: 1.4 }}>
              Depth multiplier: Basic ×0.5 · Standard ×1 · Comprehensive ×1.5 · Enterprise ×2.
            </p>
          </div>
        </div>
        {/* Test Types (multi-select) */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ListChecks style={{ width: '12px', height: '12px', color: '#94A3B8' }} />
            Test Types <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <MultiSelect
            options={config?.testTypes ?? []}
            value={formData.testTypes ?? []}
            onChange={(next) => onFormFieldChange('testTypes', next)}
            placeholder="Select test types…"
            accentColor="#06B6D4"
          />
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px', lineHeight: 1.4 }}>
            Only the selected types are generated. Defaults to all.
          </p>
        </div>
      </div>

      {/* Quick Start Templates */}
      <div style={{ marginBottom: 'var(--spacing-5)', flexShrink: 0 }}>
        <div style={{
          fontSize: 'var(--text-ui-xs)',
          fontWeight: '600',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--spacing-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Quick Start Templates
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          {TEMPLATE_BUTTONS.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => handleTemplateClick(template)}
              style={{
                background: 'var(--background-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-ui-sm)',
                fontWeight: '500',
                padding: 'var(--spacing-2) var(--spacing-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#E2E8F0';
                e.currentTarget.style.borderColor = '#94A3B8';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      {/* Tips Box */}
      <div style={{
        background: '#EFF6FF',
        border: '1px solid #DBEAFE',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        flexShrink: 0
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#3B82F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px'
        }}>
          <Lightbulb style={{ width: '12px', height: '12px', color: '#FFFFFF' }} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E40AF', marginBottom: '4px' }}>
            Pro Tip
          </div>
          <div style={{ fontSize: '14px', color: '#1E3A8A', lineHeight: '1.5' }}>
            {TIPS[currentTipIndex]}
          </div>
        </div>
      </div>

      {/* User Story Section */}
      <div style={{ marginBottom: '24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            User Story / Requirement
          </label>
          <button
            type="button"
            onClick={onToggleOptional}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#3B82F6',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#EFF6FF'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Plus style={{ width: '14px', height: '14px' }} />
            Optional fields
          </button>
        </div>
        <AutoResizeTextarea
          value={formData.userStory}
          onChange={(e) => onFormFieldChange('userStory', e.target.value)}
          minRows={5}
          maxRows={16}
          style={{
            width: '100%',
            background: '#FFFFFF',
            border: '2px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            color: '#0F172A',
            fontSize: '15px',
            lineHeight: '1.6',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3B82F6';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.boxShadow = 'none';
          }}
          placeholder="Describe your requirement in detail..."
        />
      </div>

      {/* Optional Fields */}
      {showOptional && (
        <div style={{ marginBottom: '24px', flexShrink: 0 }}>
          <input
            type="text"
            value={formData.featureName}
            onChange={(e) => onFormFieldChange('featureName', e.target.value)}
            placeholder="Feature Name"
            style={{
              width: '100%',
              height: '48px',
              background: '#FFFFFF',
              border: '2px solid #E2E8F0',
              borderRadius: '12px',
              padding: '0 16px',
              fontSize: '15px',
              color: '#0F172A',
              marginBottom: '16px',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3B82F6';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <AutoResizeTextarea
            value={formData.businessRules}
            onChange={(e) => onFormFieldChange('businessRules', e.target.value)}
            placeholder="Business Rules (optional)"
            minRows={3}
            maxRows={12}
            style={{
              width: '100%',
              background: '#FFFFFF',
              border: '2px solid #E2E8F0',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '15px',
              color: '#0F172A',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3B82F6';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      )}

      {/* Acceptance Criteria Section */}
      <div style={{ marginBottom: '24px', flexShrink: 0 }}>
        <label style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#0F172A',
          marginBottom: '12px',
          display: 'block'
        }}>
          Acceptance Criteria
        </label>
        <AutoResizeTextarea
          value={formData.acceptanceCriteria}
          onChange={(e) => onFormFieldChange('acceptanceCriteria', e.target.value)}
          minRows={5}
          maxRows={16}
          style={{
            width: '100%',
            background: '#FFFFFF',
            border: '2px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            color: '#0F172A',
            fontSize: '15px',
            lineHeight: '1.6',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3B82F6';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.boxShadow = 'none';
          }}
          placeholder="Define success conditions and acceptance criteria..."
        />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '16px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          flexShrink: 0
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <AlertTriangle style={{ width: '14px', height: '14px', color: '#FFFFFF' }} />
          </div>
          <p style={{ fontSize: '14px', color: '#991B1B', fontWeight: 500, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1, minHeight: '20px', flexShrink: 0 }} />

      {/* Generate Button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canGenerate}
        style={{
          width: '100%',
          height: '52px',
          borderRadius: '12px',
          fontWeight: 600,
          fontSize: '16px',
          background: !canGenerate ? '#94A3B8' : '#06B6D4',
          color: '#FFFFFF',
          transition: 'all 0.2s ease',
          border: 'none',
          cursor: !canGenerate ? 'not-allowed' : 'pointer',
          boxShadow: !canGenerate ? 'none' : '0 4px 6px -1px rgba(59, 130, 246, 0.3)',
          opacity: !canGenerate ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          flexShrink: 0
        }}
        onMouseEnter={(e) => {
          const target = e.currentTarget as HTMLButtonElement;
          if (canGenerate) {
            target.style.background = '#2563EB';
            target.style.transform = 'translateY(-2px)';
            target.style.boxShadow = '0 8px 12px -1px rgba(59, 130, 246, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget as HTMLButtonElement;
          if (canGenerate) {
            target.style.background = '#3B82F6';
            target.style.transform = 'translateY(0)';
            target.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.3)';
          }
        }}
      >
        {isGenerating ? (
          <>
            <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
            Generating...
          </>
        ) : (
          <>
            <Sparkles style={{ width: '18px', height: '18px' }} />
            Generate Test Cases
          </>
        )}
      </button>
    </div>
  );
}
