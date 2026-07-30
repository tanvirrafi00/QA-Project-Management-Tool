'use client';

/**
 * Project Context — active-projects list provider.
 *
 * Provides the shared list of active projects (fetched once, reused app-wide) plus `refreshProjects`.
 * It deliberately does NOT hold a "selected project" any more: each project-scoped module owns its own
 * selection via `useModuleProject(moduleKey)` (per-module, persisted). See the per-module-selection
 * plan and `hooks/useModuleProject.ts`.
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    ReactNode,
} from 'react';
import { Project } from './types';
import { projectService } from './services/project.service';
import { useAuth } from '@/features/auth/AuthContext';

interface ProjectContextValue {
    /** All active projects (shared across modules). */
    projects: Project[];
    /** Whether the active-projects list is loading. */
    loading: boolean;
    /** Re-fetch the active projects list from the backend. */
    refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshProjects = useCallback(async () => {
        setLoading(true);
        const result = await projectService.listActiveProjects();
        if (result.success && result.data) {
            setProjects(result.data);
        }
        setLoading(false);
    }, []);

    // Fetch active projects only when authenticated (avoids 401 noise on public/auth pages).
    useEffect(() => {
        if (user) refreshProjects();
    }, [user, refreshProjects]);

    const value = useMemo<ProjectContextValue>(
        () => ({ projects, loading, refreshProjects }),
        [projects, loading, refreshProjects],
    );

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
    const ctx = useContext(ProjectContext);
    if (!ctx) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return ctx;
}
