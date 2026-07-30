'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ProjectProvider } from '@/features/project-management/ProjectContext';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Client-side providers mounted once in the root layout.
 * `AuthProvider` wraps `ProjectProvider` so the project context can gate its fetch on auth.
 * `ToastProvider` sits at the very top so any component can call `useToast()` and the
 * global notification stack (Toaster) renders exactly once for the whole app.
 */
export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <ToastProvider>
            <AuthProvider>
                <ProjectProvider>{children}</ProjectProvider>
            </AuthProvider>
        </ToastProvider>
    );
}
