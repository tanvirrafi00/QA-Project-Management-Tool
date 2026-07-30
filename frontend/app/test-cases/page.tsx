/**
 * Test Cases Generator Page
 * Server Component - full-page wizard (Input → Processing → Results)
 */

import { AppShell, PageContainer } from '@/components/layout';
import { TestGeneratorClient } from './components/TestGeneratorClient';

export const metadata = {
  title: 'Test Case Generator | AI-Powered Testing',
  description: 'Generate comprehensive test cases using multi-agent AI analysis',
};

export default function TestCasesPage() {
  return (
    <AppShell>
      <PageContainer className="max-w-full bg-transparent" style={{ minHeight: '100vh' }}>
        {/* Full-width wizard — no split screen */}
        <TestGeneratorClient />
      </PageContainer>
    </AppShell>
  );
}
