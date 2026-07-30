/**
 * Test Case Utility Functions
 * Filtering, sorting, pagination, and export helpers
 */

import { TestCase, FilterState, SortConfig, TestCasesByType } from '../types';

/** Display labels for test types (mirrors backend TEST_TYPE_LABELS). */
export const TEST_TYPE_LABELS: Record<string, string> = {
    scenario: 'Scenario',
    functional: 'Functional',
    negative: 'Negative',
    edge: 'Edge',
    security: 'Security',
    boundary: 'Boundary',
    ui: 'UI',
    validation: 'Validation',
    api: 'API',
    permission: 'Permission',
    workflow: 'Workflow',
    integration: 'Integration',
    data_integrity: 'Data Integrity',
    performance: 'Performance',
    accessibility: 'Accessibility',
};

/** Human label for a type value, falling back to a prettified form. */
export function typeLabel(type: string): string {
    return TEST_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Canonical display order for test types — FUNCTIONAL FIRST (the functional-first coverage
 * strategy mandates Functional as the first tab), then the secondary dimensions in the spec's
 * strict tab order (UI, Validation, Negative, Boundary, Workflow, API, Security), then the rest.
 * Mirrors the backend TEST_TYPE_TAB_ORDER so the UI and server agree on ordering.
 */
export const TEST_TYPE_TAB_ORDER: readonly string[] = [
    'functional',
    'ui',
    'validation',
    'negative',
    'boundary',
    'workflow',
    'api',
    'security',
    'permission',
    'integration',
    'data_integrity',
    'performance',
    'accessibility',
    'scenario',
    'edge',
];

/** Sort rank for a type (lower = earlier). Unknown types sort after all known ones. */
export function testTypeOrderIndex(type: string): number {
    const idx = TEST_TYPE_TAB_ORDER.indexOf(type);
    return idx === -1 ? TEST_TYPE_TAB_ORDER.length : idx;
}

/**
 * Get all test cases as a flat array (works with the dynamic type→cases map).
 */
export function flattenTestCases(testCases: TestCasesByType): TestCase[] {
  return Object.values(testCases ?? {}).flat();
}

/**
 * Get test cases for a specific type (dynamic key).
 */
export function getCasesByCategory(testCases: TestCasesByType, category: string): TestCase[] {
  return testCases?.[category] ?? [];
}

/**
 * Filter test cases by search query and filter state
 */
export function filterTestCases(cases: TestCase[], filter: FilterState): TestCase[] {
  return cases.filter(tc => {
    // Search filter
    if (filter.search) {
      const query = filter.search.toLowerCase();
      const searchable = [
        tc.id,
        tc.name || tc.scenario,
        tc.module || '',
        tc.priority,
        tc.type,
        ...(tc.tags || []),
      ].join(' ').toLowerCase();

      if (!searchable.includes(query)) return false;
    }

    // Priority filter
    if (filter.priorities.size > 0 && !filter.priorities.has(tc.priority)) {
      return false;
    }

    // Type filter
    if (filter.types.size > 0 && !filter.types.has(tc.type)) {
      return false;
    }

    // Module filter
    if (filter.modules.size > 0 && tc.module && !filter.modules.has(tc.module)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort test cases by field and direction
 */
export function sortTestCases(cases: TestCase[], config: SortConfig): TestCase[] {
  const priorityOrder: Record<string, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  return [...cases].sort((a, b) => {
    let comparison = 0;

    switch (config.field) {
      case 'id':
        comparison = a.id.localeCompare(b.id);
        break;
      case 'name':
        comparison = (a.name || a.scenario).localeCompare(b.name || b.scenario);
        break;
      case 'priority':
        comparison = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'module':
        comparison = (a.module || '').localeCompare(b.module || '');
        break;
    }

    return config.direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Paginate test cases
 */
export function paginateTestCases<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * Get all unique modules from test cases
 */
export function getUniqueModules(cases: TestCase[]): string[] {
  const modules = new Set<string>();
  cases.forEach(tc => {
    if (tc.module) modules.add(tc.module);
  });
  return Array.from(modules).sort();
}

/**
 * Export test cases to CSV format
 */
export function exportToCSV(cases: TestCase[]): string {
  const headers = [
    'Module', 'TC ID', 'TC Name', 'Priority', 'Test Steps',
    'Expected Results', 'Test Status', 'Actual Result',
    'Assigned To', 'Execution Date', 'Related Bugs', 'Comments',
  ];

  const rows = cases.map(tc => [
    tc.module || 'General',
    tc.id,
    tc.name || tc.scenario,
    tc.priority,
    (tc.steps || []).join('; '),
    tc.expectedResult || '',
    tc.testStatus || 'Not Executed',
    tc.actualResult || 'N/A',
    tc.assignedTo || 'Unassigned',
    tc.executionDate || '',
    tc.relatedBugs || 'N/A',
    tc.comments || 'N/A',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csv;
}

/**
 * Export test cases to Markdown format
 */
export function exportToMarkdown(cases: TestCase[]): string {
  let md = `# Test Cases\n\n`;
  md += `**Total:** ${cases.length}\n\n`;
  md += `| TC ID | Name | Priority | Type | Module |\n`;
  md += `|-------|------|----------|------|--------|\n`;

  cases.forEach(tc => {
    md += `| ${tc.id} | ${tc.name || tc.scenario} | ${tc.priority} | ${tc.type} | ${tc.module || 'General'} |\n`;
  });

  md += `\n---\n\n`;

  cases.forEach(tc => {
    md += `## ${tc.id}: ${tc.name || tc.scenario}\n\n`;
    md += `- **Priority:** ${tc.priority}\n`;
    md += `- **Type:** ${tc.type}\n`;
    md += `- **Module:** ${tc.module || 'General'}\n\n`;
    md += `### Steps\n\n`;
    (tc.steps || []).forEach((step, i) => {
      md += `${i + 1}. ${step}\n`;
    });
    md += `\n### Expected Result\n\n${tc.expectedResult}\n\n---\n\n`;
  });

  return md;
}

/**
 * Download content as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
