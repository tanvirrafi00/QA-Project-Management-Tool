'use client';

/**
 * useModuleProject — per-module project selection.
 *
 * Each project-scoped module owns its own selected project, independent of every other module
 * (replacing the old single global selection in the header). The active-projects list is shared via
 * `ProjectContext` (one fetch); this hook owns only the selection: it hydrates from localStorage,
 * auto-selects the most-recent active project when nothing valid is remembered, and persists changes.
 *
 * Decisions: per-module persistence + auto-select-first (see the per-module-selection plan).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProject } from '../ProjectContext';
import { Project } from '../types';

const STORAGE_PREFIX = 'qa-copilot.project.';

export interface ModuleProjectValue {
    /** All active projects (shared list from ProjectContext). */
    projects: Project[];
    /** Whether the shared active-projects list is loading. */
    loading: boolean;
    /** The project this module has selected (derived from `selectedProjectName`). */
    selectedProject: Project | null;
    /** The name of this module's selected project — the key its data scopes by. */
    selectedProjectName: string | null;
    /** Change this module's selected project (persists to localStorage). */
    setSelectedProject: (projectName: string | null) => void;
}

export function useModuleProject(moduleKey: string): ModuleProjectValue {
    const { projects, loading } = useProject();
    const storageKey = `${STORAGE_PREFIX}${moduleKey}`;

    const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);

    // Hydrate the persisted selection on mount (client-only — avoids SSR mismatch).
    useEffect(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
        if (stored) setSelectedProjectName(stored);
        setHydrated(true);
    }, [storageKey]);

    // Once projects are loaded, ensure the selection is valid. Auto-selects the first active
    // project (newest first, as the repo returns them) when nothing is remembered or the remembered
    // project was deleted/archived. Mirrors the logic that used to live in ProjectContext.
    useEffect(() => {
        if (!hydrated || loading) return;

        const stillExists = selectedProjectName
            ? projects.some((p) => p.projectName === selectedProjectName)
            : false;

        if (!stillExists) {
            const next = projects[0]?.projectName ?? null;
            setSelectedProjectName(next);
            if (next) localStorage.setItem(storageKey, next);
            else localStorage.removeItem(storageKey);
        }
    }, [hydrated, loading, projects, selectedProjectName, storageKey]);

    const setSelectedProject = useCallback((projectName: string | null) => {
        setSelectedProjectName(projectName);
        if (projectName) localStorage.setItem(storageKey, projectName);
        else localStorage.removeItem(storageKey);
    }, [storageKey]);

    const selectedProject = useMemo(
        () => projects.find((p) => p.projectName === selectedProjectName) ?? null,
        [projects, selectedProjectName],
    );

    return { projects, loading, selectedProject, selectedProjectName, setSelectedProject };
}
