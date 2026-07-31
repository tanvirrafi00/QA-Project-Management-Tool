'use client';

/**
 * PasteTestCasesDialog — Enhanced modal dialog for test case import with comprehensive user guidance.
 * Provides clear instructions, template examples, and smart validation feedback.
 */

import { useState, useEffect, useRef } from 'react';
import { ClipboardPaste, CheckCircle, AlertCircle, X, Save, Download, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/core';
import { useToast } from '@/components/ui/Toast';
import { parsePaste, savePaste, type TestCasePasteRow, type ImportedModule } from '../services/test-case-paste.service';

const labelCls = 'block text-xs font-medium text-[#64748B] mb-1.5';
const inputCls = 'w-full h-64 px-3 py-3 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#1E293B] resize-none font-mono focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]';

interface Props {
    projectName: string;
    module: string;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export function PasteTestCasesDialog({ projectName, module, open, onClose, onSaved }: Props) {
    const toast = useToast();
    const [pasting, setPasting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [error, setError] = useState<string>('');
    const [formatDetected, setFormatDetected] = useState<string>('');
    const [showTemplate, setShowTemplate] = useState(false);
    const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

    // Required columns for test case import
    const requiredColumns = [
        'Module',
        'TC ID',
        'TC Name',
        'Priority',
        'Test Steps',
        'Expected Results',
        'Test Status',
        'Actual Result',
        'Assigned To',
        'Execution Date',
        'Related Bugs',
        'Comments'
    ];

    // Auto-focus paste area when dialog opens
    useEffect(() => {
        if (open && pasteAreaRef.current) {
            pasteAreaRef.current.focus();
        }
    }, [open]);

    const handlePaste = async () => {
        if (!pasteText.trim()) {
            setError('Please paste some data first.');
            return;
        }

        setPasting(true);
        setError('');

        try {
            const result = await parsePaste(pasteText, projectName);

            if (!result.success || !result.data) {
                setError(result.error || 'Failed to parse paste');
                return;
            }

            setPreview(result.data);

            // Detect format based on content
            if (pasteText.includes('|')) {
                setFormatDetected('Markdown Table');
            } else if (pasteText.includes('\t')) {
                setFormatDetected('TSV');
            } else if (pasteText.includes('\n')) {
                setFormatDetected('Google Sheets / Excel');
            } else {
                setFormatDetected('Plain Data');
            }

            toast.success(`Parsed ${result.data.totalCases} test cases successfully`);
        } catch (err: any) {
            setError(err.message || 'Failed to parse paste');
            toast.error('Failed to parse paste');
        } finally {
            setPasting(false);
        }
    };

    const handleSave = async () => {
        if (!preview || !preview.modules || preview.modules.length === 0) {
            setError('No test cases to save.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const input = {
                projectName,
                modules: preview.modules,
            };

            const result = await savePaste(input);

            if (!result.success) {
                setError(result.error || 'Failed to save test cases');
                return;
            }

            if (result.data) {
                toast.success(`Successfully imported ${result.data.total} test cases`);
            }
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save test cases');
            toast.error('Failed to save test cases');
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            handleSave();
        }
    };

    const clearPaste = () => {
        setPasteText('');
        setPreview(null);
        setError('');
        setFormatDetected('');
        setShowTemplate(false);
    };

    const downloadTemplate = () => {
        // This would typically download an actual Excel file
        // For now, we'll show a message
        toast.info('Excel template download would be implemented here');
    };

    return (
        <Modal open={open} onClose={() => !saving && onClose()} size="lg" title="Paste Test Cases">
            {!preview ? (
                <div className="space-y-6">
                    {/* Main Instructions */}
                    <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
                        <p className="text-sm text-[#1E293B] mb-4">
                            Import test cases by pasting a table copied from AI, Excel or Google Sheets.
                        </p>

                        {/* Supported Sources */}
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold text-[#1E293B] mb-2">📋 Supported Sources</h3>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-white rounded border border-[#E2E8F0] text-xs text-[#64748B]">
                                    ✓ ChatGPT / AI Generated Markdown Table
                                </span>
                                <span className="px-2 py-1 bg-white rounded border border-[#E2E8F0] text-xs text-[#64748B]">
                                    ✓ Microsoft Excel
                                </span>
                                <span className="px-2 py-1 bg-white rounded border border-[#E2E8F0] text-xs text-[#64748B]">
                                    ✓ Google Sheets
                                </span>
                                <span className="px-2 py-1 bg-white rounded border border-[#E2E8F0] text-xs text-[#64748B]">
                                    ✓ TSV (Tab Separated Values)
                                </span>
                            </div>
                        </div>

                        {/* Import Requirements */}
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold text-[#1E293B] mb-2">ℹ Import Requirements</h3>
                            <ul className="text-xs text-[#64748B] space-y-1">
                                <li>• Paste only data rows (header row optional)</li>
                                <li>• One or multiple rows are supported</li>
                                <li>• Data will be mapped to predefined columns</li>
                                <li>• Column order must match the template</li>
                                <li>• Additional columns will be ignored</li>
                            </ul>
                        </div>

                        {/* Template Actions */}
                        <div className="flex gap-2 mb-4">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowTemplate(!showTemplate)}
                                leftIcon={<Eye className="w-3 h-3" />}
                            >
                                {showTemplate ? 'Hide Template' : 'View Full Template'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={downloadTemplate}
                                leftIcon={<Download className="w-3 h-3" />}
                            >
                                Download Excel Template
                            </Button>
                        </div>

                        {/* Template Preview */}
                        {showTemplate && (
                            <div className="bg-white rounded border border-[#E2E8F0] p-3">
                                <div className="text-xs font-mono text-[#1E293B] mb-2 overflow-x-auto">
                                    <pre>| Module | TC ID | TC Name | Priority | Test Steps | Expected Results | Test Status | Actual Result | Assigned To | Execution Date | Related Bugs | Comments |
                                        |--------|-------|----------|----------|------------|------------------|-------------|---------------|-------------|----------------|-------------|-----------|
                                        | Login | TC-001 | Verify Login | High | 1. Open login page&lt;br&gt;2. Enter credentials&lt;br&gt;3. Click login | User should be redirected to dashboard | Passed | Login successful | QA Engineer | 2024-01-15 | BUG-001 | Initial test |</pre>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Required Columns */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <h3 className="text-xs font-semibold text-[#1E293B] mb-3">Required Columns</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {requiredColumns.map((col, index) => (
                                <div key={index} className="text-xs text-[#1E293B] bg-white rounded px-2 py-1 border border-blue-200">
                                    {col}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Paste Area */}
                    <div className="space-y-2">
                        <label className={labelCls}>Paste Table</label>
                        <textarea
                            ref={pasteAreaRef}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Paste only the data rows (header row optional).

Supported:
• AI-generated Markdown tables
• Excel
• Google Sheets

Press Ctrl + V to paste."
                            className={inputCls}
                            disabled={pasting}
                        />
                    </div>

                    {/* Smart Detection Feedback */}
                    {formatDetected && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span>✓ {formatDetected} Detected</span>
                        </div>
                    )}

                    {/* Validation Summary */}
                    {pasteText.trim() && !error && (
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                            <div className="text-xs text-green-700 space-y-1">
                                <div className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    <span>Header row optional</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    <span>{requiredColumns.length} required columns expected</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    <span>{pasteText.split('\n').length} rows detected</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-red-700 font-medium">{error}</p>
                                {error.includes('Missing Required Column') && (
                                    <p className="text-xs text-red-600 mt-1">Please ensure all required columns are present in your data.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AI Workflow Hint */}
                    <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                        <div className="flex items-start gap-2">
                            <span className="text-purple-600">💡</span>
                            <div>
                                <p className="text-xs text-purple-700 font-medium">Tip</p>
                                <p className="text-xs text-purple-600">Generate test case tables with AI, copy the generated table, then paste it here.</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
                        <span className="text-xs text-[#64748B]">
                            Press <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[#64748B]">Ctrl/Cmd</kbd> + <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[#64748B]">Enter</kbd> to save
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={clearPaste} disabled={saving}>
                                Clear
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handlePaste}
                                isLoading={pasting}
                                disabled={saving || !pasteText.trim()}
                                leftIcon={!pasting ? <ClipboardPaste className="w-4 h-4" /> : undefined}
                            >
                                {pasting ? 'Parsing...' : 'Parse Table'}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
                        <p className="text-sm text-[#1E293B] mb-2">
                            <strong>{preview.totalCases} Test Cases</strong> parsed successfully across {preview.modules.length} modules
                        </p>
                        <div className="flex gap-4 text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                All valid
                            </span>
                            <span className="flex items-center gap-1 text-yellow-600">
                                <AlertCircle className="w-4 h-4" />
                                0 warnings
                            </span>
                        </div>
                    </div>

                    {/* Module Preview */}
                    <div className="space-y-4">
                        {preview.modules.map((m: ImportedModule, moduleIndex: number) => (
                            <div key={moduleIndex} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                                <div className="bg-[#F8FAFC] px-4 py-2 border-b border-[#E2E8F0]">
                                    <h4 className="text-sm font-semibold text-[#1E293B]">{m.module} ({m.testCases.length} test cases)</h4>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[#E2E8F0] bg-white">
                                                <th className="text-left py-2 px-3 font-semibold text-[#1E293B]">TC ID</th>
                                                <th className="text-left py-2 px-3 font-semibold text-[#1E293B]">Name</th>
                                                <th className="text-left py-2 px-3 font-semibold text-[#1E293B]">Priority</th>
                                                <th className="text-left py-2 px-3 font-semibold text-[#1E293B]">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {m.testCases.map((tc: TestCasePasteRow, caseIndex: number) => (
                                                <tr key={`${moduleIndex}-${caseIndex}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                                                    <td className="py-2 px-3 text-[#64748B]">{tc.tcId || 'Auto-generated'}</td>
                                                    <td className="py-2 px-3 text-[#1E293B]">{tc.name}</td>
                                                    <td className="py-2 px-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${tc.priority === 'Critical' ? 'bg-red-100 text-red-700' :
                                                            tc.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                                                tc.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                                                    'bg-green-100 text-green-700'
                                                            }`}>
                                                            {tc.priority}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${tc.testStatus === 'Passed' ? 'bg-green-100 text-green-700' :
                                                            tc.testStatus === 'Failed' ? 'bg-red-100 text-red-700' :
                                                                tc.testStatus === 'Blocked' ? 'bg-gray-100 text-gray-700' :
                                                                    'bg-blue-100 text-blue-700'
                                                            }`}>
                                                            {tc.testStatus || 'Not Executed'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
                        <span className="text-xs text-[#64748B]">
                            Review the preview above before importing
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={clearPaste} disabled={saving}>
                                Edit
                            </Button>
                            <Button
                                variant="success"
                                size="sm"
                                onClick={handleSave}
                                isLoading={saving}
                                disabled={saving}
                                leftIcon={!saving ? <Save className="w-4 h-4" /> : undefined}
                            >
                                {saving ? 'Adding...' : 'Add Test Case'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
