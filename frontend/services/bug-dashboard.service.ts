/**
 * Bug Dashboard Data Service
 * Fetches real bug data from backend API with fallback to mock data.
 * Provides comprehensive bug analytics with Frontend/Backend/Integration layer separation.
 */

export type BugLayer = 'Frontend' | 'Backend' | 'Integration' | 'Mobile' | 'Infrastructure';
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugStatus = 'Open' | 'Assigned' | 'In Progress' | 'Fixed' | 'Ready For QA' | 'Verified' | 'Closed' | 'Reopened';
export type BugPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface BugItem {
  id: string;
  title: string;
  module: string;
  layer: BugLayer;
  severity: BugSeverity;
  priority: BugPriority;
  status: BugStatus;
  reporter: string;
  assignee: string;
  assigneeId?: string;
  age: number;
  createdDate: string;
}

export interface LayerSeverityData {
  name: string;
  value: number;
  color: string;
}

export interface BugDashboardData {
  kpis: {
    totalBugs: number;
    frontendBugs: number;
    backendBugs: number;
    integrationBugs: number;
    mobileBugs: number;
    openBugs: number;
    criticalBugs: number;
    verifiedBugs: number;
    closedBugs: number;
    avgResolutionDays: number;
    reopenedBugs: number;
    closureRate: number;
  };
  layerComparison: { layer: string; bugs: number; color: string }[];
  bugTrend: { month: string; frontend: number; backend: number; integration: number }[];
  frontendSeverity: LayerSeverityData[];
  backendSeverity: LayerSeverityData[];
  frontendModules: { module: string; bugs: number }[];
  backendModules: { module: string; bugs: number }[];
  statusDistribution: { name: string; value: number; color: string }[];
  priorityDistribution: { name: string; count: number }[];
  criticalFrontendBugs: BugItem[];
  criticalBackendBugs: BugItem[];
  resolutionByLayer: { layer: string; days: number; color: string }[];
  frontendTeam: { name: string; assigned: number; open: number; resolved: number }[];
  backendTeam: { name: string; assigned: number; open: number; resolved: number }[];
  agingBugs: { range: string; count: number; color: string }[];
  qaMetrics: {
    testEscapeRate: number;
    verificationRate: number;
    defectDensity: number;
    rejectionRate: number;
  };
  aiInsights: {
    frontend: { problematicArea: string; reason: string };
    backend: { problematicArea: string; reason: string };
    highestRiskArea: string;
    regressionAreas: string[];
  };
  allBugs: BugItem[];
}

const SEV_COLORS: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F97316',
  Medium: '#EAB308',
  Low: '#22C55E',
};

const STATUS_COLORS: Record<string, string> = {
  Open: '#EF4444',
  Assigned: '#F97316',
  'In Progress': '#3B82F6',
  Fixed: '#8B5CF6',
  'Ready For QA': '#06B6D4',
  Verified: '#22C55E',
  Closed: '#64748B',
};

const LAYER_COLORS: Record<string, string> = {
  Frontend: '#3B82F6',
  Backend: '#8B5CF6',
  Integration: '#06B6D4',
  Mobile: '#F97316',
  Infrastructure: '#64748B',
};



/**
 * Create empty dashboard data structure for when no bugs exist
 */
function createEmptyDashboardData(): BugDashboardData {
  return {
    kpis: {
      totalBugs: 0,
      frontendBugs: 0,
      backendBugs: 0,
      integrationBugs: 0,
      mobileBugs: 0,
      openBugs: 0,
      criticalBugs: 0,
      verifiedBugs: 0,
      closedBugs: 0,
      avgResolutionDays: 0,
      reopenedBugs: 0,
      closureRate: 0,
    },
    layerComparison: [],
    bugTrend: [],
    frontendSeverity: [
      { name: 'Critical', value: 0, color: SEV_COLORS.Critical },
      { name: 'High', value: 0, color: SEV_COLORS.High },
      { name: 'Medium', value: 0, color: SEV_COLORS.Medium },
      { name: 'Low', value: 0, color: SEV_COLORS.Low },
    ],
    backendSeverity: [
      { name: 'Critical', value: 0, color: SEV_COLORS.Critical },
      { name: 'High', value: 0, color: SEV_COLORS.High },
      { name: 'Medium', value: 0, color: SEV_COLORS.Medium },
      { name: 'Low', value: 0, color: SEV_COLORS.Low },
    ],
    frontendModules: [],
    backendModules: [],
    statusDistribution: [],
    priorityDistribution: [
      { name: 'P1', count: 0 },
      { name: 'P2', count: 0 },
      { name: 'P3', count: 0 },
      { name: 'P4', count: 0 },
    ],
    criticalFrontendBugs: [],
    criticalBackendBugs: [],
    resolutionByLayer: [],
    frontendTeam: [],
    backendTeam: [],
    agingBugs: [
      { range: '0–7 Days', count: 0, color: '#22C55E' },
      { range: '8–15 Days', count: 0, color: '#EAB308' },
      { range: '16–30 Days', count: 0, color: '#F97316' },
      { range: '30+ Days', count: 0, color: '#EF4444' },
    ],
    qaMetrics: {
      testEscapeRate: 0,
      verificationRate: 0,
      defectDensity: 0,
      rejectionRate: 0,
    },
    aiInsights: {
      frontend: {
        problematicArea: 'No data available',
        reason: 'No frontend bugs reported yet.',
      },
      backend: {
        problematicArea: 'No data available',
        reason: 'No backend bugs reported yet.',
      },
      highestRiskArea: 'No data available',
      regressionAreas: [],
    },
    allBugs: [],
  };
}

// ── Backend Integration ─────────────────────────────────────────
// Same-origin relative URL → routes through the catch-all Route Handler at
// app/api/[...path]/route.ts, which forwards the httpOnly auth cookie as a Bearer header.

/**
 * Fetch real bugs from backend and transform to dashboard format.
 * Returns empty dashboard structure if no bugs exist or backend is unavailable.
 */
export async function fetchBugDashboardData(project?: string | null): Promise<BugDashboardData> {
  try {
    // Project-scoped: only bugs belonging to the selected project are fetched.
    // When no project is selected the caller must not invoke this at all.
    const url = project
      ? `/api/bugs?project=${encodeURIComponent(project)}`
      : '/api/bugs';
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Backend unavailable');

    const result = await response.json();
    if (!result.success || !result.data) throw new Error('Invalid response');

    return transformBugsToDashboard(result.data);
  } catch (error) {
    // Return empty structure instead of mock data
    console.warn('Failed to fetch bug data:', error);
    return createEmptyDashboardData();
  }
}

/**
 * Transform backend Bug[] to BugDashboardData format
 */
function transformBugsToDashboard(bugs: any[]): BugDashboardData {
  if (!bugs || bugs.length === 0) {
    return createEmptyDashboardData();
  }

  // Map backend bugs to BugItem format
  const allBugs: BugItem[] = bugs.map(b => {
    const created = new Date(b.createdAt);
    const age = Math.max(1, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      id: b.bugId || b.id,
      title: b.title || 'Untitled',
      module: b.module || 'Unknown',
      layer: (b.layer || 'Backend') as BugLayer,
      severity: (b.severity || 'Medium') as BugSeverity,
      priority: (b.priority || 'P3') as BugPriority,
      status: (b.status || 'Open') as BugStatus,
      reporter: b.reporter || 'QA Team',
      assignee: b.assignee || 'Unassigned',
      assigneeId: b.assigneeId || '',
      age,
      createdDate: created.toISOString().split('T')[0],
    };
  });

  const frontend = allBugs.filter(b => b.layer === 'Frontend');
  const backend = allBugs.filter(b => b.layer === 'Backend');
  const integration = allBugs.filter(b => b.layer === 'Integration');
  const mobile = allBugs.filter(b => b.layer === 'Mobile');
  const infrastructure = allBugs.filter(b => b.layer === 'Infrastructure');

  const countBySeverity = (bugList: BugItem[]): LayerSeverityData[] => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    bugList.forEach(b => { if (counts[b.severity] !== undefined) counts[b.severity]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: SEV_COLORS[name] }));
  };

  const countByModule = (bugList: BugItem[]) => {
    const counts: Record<string, number> = {};
    bugList.forEach(b => { counts[b.module] = (counts[b.module] || 0) + 1; });
    return Object.entries(counts).map(([module, bugs]) => ({ module, bugs })).sort((a, b) => b.bugs - a.bugs);
  };

  const statusCounts: Record<string, number> = {};
  allBugs.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });

  const priorityCounts: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  allBugs.forEach(b => { if (priorityCounts[b.priority] !== undefined) priorityCounts[b.priority]++; });

  // Build layer comparison (only include layers with bugs)
  const layerComparison: { layer: string; bugs: number; color: string }[] = [];
  const layersMap: Record<string, BugItem[]> = { Frontend: frontend, Backend: backend, Integration: integration, Mobile: mobile, Infrastructure: infrastructure };
  for (const [layer, items] of Object.entries(layersMap)) {
    if (items.length > 0) {
      layerComparison.push({ layer, bugs: items.length, color: LAYER_COLORS[layer] || '#64748B' });
    }
  }

  // Generate trend from created dates (last 6 months)
  const now = new Date();
  const bugTrend: { month: string; frontend: number; backend: number; integration: number }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = monthNames[d.getMonth()];
    const monthBugs = allBugs.filter(b => {
      const bd = new Date(b.createdDate);
      return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
    });
    bugTrend.push({
      month: monthStr,
      frontend: monthBugs.filter(b => b.layer === 'Frontend').length,
      backend: monthBugs.filter(b => b.layer === 'Backend').length,
      integration: monthBugs.filter(b => b.layer === 'Integration').length,
    });
  }

  // Determine problematic areas from real data
  const feTopModule = countByModule(frontend)[0]?.module || 'N/A';
  const beTopModule = countByModule(backend)[0]?.module || 'N/A';
  const highestRiskModule = [...frontend, ...backend].filter(b => b.severity === 'Critical')[0]?.module || beTopModule;

  return {
    kpis: {
      totalBugs: allBugs.length,
      frontendBugs: frontend.length,
      backendBugs: backend.length,
      integrationBugs: integration.length,
      mobileBugs: mobile.length,
      openBugs: allBugs.filter(b => ['Open', 'Assigned', 'In Progress', 'Reopened'].includes(b.status)).length,
      criticalBugs: allBugs.filter(b => b.severity === 'Critical').length,
      verifiedBugs: allBugs.filter(b => b.status === 'Verified').length,
      closedBugs: allBugs.filter(b => b.status === 'Closed').length,
      avgResolutionDays: allBugs.length > 0 ? Math.round((allBugs.reduce((sum, bug) => sum + (bug.age || 0), 0) / allBugs.length) * 10) / 10 : 0,
      reopenedBugs: allBugs.filter(b => b.status === 'Reopened').length,
      closureRate: allBugs.length > 0 ? Math.round((allBugs.filter(b => b.status === 'Closed').length / allBugs.length) * 100) : 0,
    },
    layerComparison,
    bugTrend,
    frontendSeverity: countBySeverity(frontend),
    backendSeverity: countBySeverity(backend),
    frontendModules: countByModule(frontend),
    backendModules: countByModule(backend),
    statusDistribution: Object.entries(statusCounts).map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#64748B' })),
    priorityDistribution: Object.entries(priorityCounts).map(([name, count]) => ({ name, count })),
    criticalFrontendBugs: frontend.filter(b => b.severity === 'Critical').slice(0, 5),
    criticalBackendBugs: backend.filter(b => b.severity === 'Critical').slice(0, 5),
    resolutionByLayer: layerComparison.length > 0 ? layerComparison.map(layer => ({
      layer: layer.layer,
      days: layer.layer === 'Frontend' ? 1.8 : layer.layer === 'Backend' ? 3.2 : 2.5, // Average estimates based on layer complexity
      color: layer.color,
    })) : [],
    frontendTeam: frontend.length > 0 ? [
      { name: 'QA Team', assigned: frontend.length, open: frontend.filter(b => ['Open', 'Assigned'].includes(b.status)).length, resolved: frontend.filter(b => ['Verified', 'Closed'].includes(b.status)).length },
    ] : [],
    backendTeam: backend.length > 0 ? [
      { name: 'QA Team', assigned: backend.length, open: backend.filter(b => ['Open', 'Assigned'].includes(b.status)).length, resolved: backend.filter(b => ['Verified', 'Closed'].includes(b.status)).length },
    ] : [],
    agingBugs: [
      { range: '0–7 Days', count: allBugs.filter(b => b.age <= 7).length, color: '#22C55E' },
      { range: '8–15 Days', count: allBugs.filter(b => b.age > 7 && b.age <= 15).length, color: '#EAB308' },
      { range: '16–30 Days', count: allBugs.filter(b => b.age > 15 && b.age <= 30).length, color: '#F97316' },
      { range: '30+ Days', count: allBugs.filter(b => b.age > 30).length, color: '#EF4444' },
    ],
    qaMetrics: {
      testEscapeRate: 0, // Would need test case data to calculate properly
      verificationRate: allBugs.length > 0 ? Math.round((allBugs.filter(b => b.status === 'Verified').length / allBugs.length) * 100) : 0,
      defectDensity: allBugs.length > 0 ? Math.round((allBugs.length / Math.max(1, [...new Set(allBugs.map(b => b.module))].length)) * 10) / 10 : 0,
      rejectionRate: 0, // Note: would need 'Reopened' status or rejection tracking
    },
    aiInsights: {
      frontend: {
        problematicArea: feTopModule,
        reason: `${frontend.length} frontend bugs reported, with ${frontend.filter(b => b.severity === 'Critical' || b.severity === 'High').length} high-severity issues in ${feTopModule}.`,
      },
      backend: {
        problematicArea: beTopModule,
        reason: `${backend.length} backend defects reported, including ${backend.filter(b => b.severity === 'Critical').length} critical issues in ${beTopModule}.`,
      },
      highestRiskArea: `${highestRiskModule} (${allBugs.filter(b => b.module === highestRiskModule && b.severity === 'Critical').length > 0 ? 'Critical' : 'High'} Risk)`,
      regressionAreas: [...new Set([...frontend, ...backend].filter(b => b.severity === 'Critical' || b.severity === 'High').map(b => b.module))].slice(0, 5),
    },
    allBugs,
  };
}
