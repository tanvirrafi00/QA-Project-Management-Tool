'use client';

import { useState } from 'react';
import { AppShell, PageContainer, Panel } from '@/components/layout';
import { SectionHeader, Button, Label, Input } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { User, Bell, Key, Palette, Trash } from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'api' | 'appearance'>('profile');

  return (
    <AppShell>
      <PageContainer>
        <div className="space-y-8">
          <SectionHeader
            title="Settings"
            description="Manage your account and preferences"
          />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Settings Navigation */}
            <div className="lg:col-span-1">
              <Panel padding="default">
                <nav className="space-y-1">
                  {[
                    { id: 'profile', label: 'Profile', icon: User },
                    { id: 'notifications', label: 'Notifications', icon: Bell },
                    { id: 'api', label: 'API Keys', icon: Key },
                    { id: 'appearance', label: 'Appearance', icon: Palette },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border ${isActive
                          ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 border-cyan-400/20 text-white shadow-md shadow-cyan-500/25'
                          : 'bg-transparent border-transparent text-text-muted hover:text-text-primary hover:bg-background-hover'
                          }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </Panel>
            </div>

            {/* Settings Content */}
            <div className="lg:col-span-3">
              {activeTab === 'profile' && <ProfileSettings />}
              {activeTab === 'notifications' && <NotificationSettings />}
              {activeTab === 'api' && <ApiSettings />}
              {activeTab === 'appearance' && <AppearanceSettings />}
            </div>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function ProfileSettings() {
  return (
    <div className="space-y-6">
      <Panel padding="default">
        <div className="flex items-center gap-6 pb-6 border-b border-border-default">
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white text-2xl font-bold shadow-md shadow-cyan-500/25">
            JD
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">John Doe</h3>
            <p className="text-sm text-text-muted">john.doe@example.com</p>
          </div>
        </div>

        <div className="space-y-5 pt-2">
          <div>
            <Label>Full Name</Label>
            <Input defaultValue="John Doe" placeholder="Your full name" />
          </div>
          <div>
            <Label>Email Address</Label>
            <Input type="email" defaultValue="john.doe@example.com" placeholder="your@email.com" />
          </div>
          <div>
            <Label>Company</Label>
            <Input placeholder="Your company name" />
          </div>
        </div>

        <div className="pt-4 border-t border-[#1E293B]">
          <Button className="w-full">Save Changes</Button>
        </div>
      </Panel>

      <Panel padding="default">
        <h3 className="text-lg font-semibold text-[#F8FAFC] mb-4">Danger Zone</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#F8FAFC]">Delete Account</p>
            <p className="text-xs text-[#94A3B8] mt-1">Permanently delete your account and all data</p>
          </div>
          <Button variant="danger" leftIcon={<Trash className="w-4 h-4" />}>
            Delete Account
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function NotificationSettings() {
  return (
    <Panel padding="default">
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-[#F8FAFC] mb-6">Email Notifications</h3>

        {[
          { id: 'test-complete', label: 'Test generation complete', desc: 'Get notified when test generation finishes' },
          { id: 'gap-found', label: 'Gaps detected', desc: 'Receive alerts when gaps are found in requirements' },
          { id: 'weekly-report', label: 'Weekly summary', desc: 'Weekly digest of your activity' },
        ].map((setting) => (
          <div key={setting.id} className="flex items-center justify-between pb-5 border-b border-border-default last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-medium text-text-primary">{setting.label}</p>
              <p className="text-xs text-text-muted mt-1">{setting.desc}</p>
            </div>
            <button className={`w-12 h-6 rounded-full transition-colors ${setting.id !== 'weekly-report' ? 'bg-primary' : 'bg-background-elevated border border-border-default'
              } relative`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${setting.id !== 'weekly-report' ? 'translate-x-6' : ''
                }`} />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ApiSettings() {
  return (
    <Panel padding="default">
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2">API Configuration</h3>
        <p className="text-sm text-[#94A3B8] mb-6">Configure your AI provider API keys</p>

        <div className="space-y-5">
          <div>
            <Label>GLM API Key (Primary - ZhipuAI)</Label>
            <Input type="password" placeholder="88e432d99d9e446d8a74cfda7e057c51.SvsJ1HCDslKfY9CX" />
            <p className="text-xs text-[#94A3B8] mt-2">Primary provider for test case generation (GLM-5.1)</p>
          </div>

          <div>
            <Label>Gemini API Key (Fallback - Google)</Label>
            <Input type="password" placeholder="AIza..." />
            <p className="text-xs text-[#94A3B8] mt-2">Fallback provider when GLM is unavailable</p>
          </div>

          <div>
            <Label>GLM Model</Label>
            <Input placeholder="glm-5" />
            <p className="text-xs text-[#94A3B8] mt-2">GLM model to use (glm-5, glm-4.7-flash, glm-4-flash)</p>
          </div>

          <div>
            <Label>GLM API Endpoint</Label>
            <Input placeholder="https://open.bigmodel.cn/api/paas/v4" />
            <p className="text-xs text-[#94A3B8] mt-2">Optional: Custom GLM API endpoint</p>
          </div>
        </div>

        <div className="pt-4 border-t border-border-default">
          <Button className="w-full">Save API Keys</Button>
        </div>

        <div className="p-4 rounded-xl bg-background-elevated/40 border border-border-default">
          <p className="text-xs text-text-muted">
            <strong className="text-text-primary">Note:</strong> The system uses GLM as the primary provider and automatically falls back to Gemini on quota or rate limit errors.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function AppearanceSettings() {
  const [fontSize, setFontSize] = useState('medium');

  return (
    <Panel padding="default">
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2">Appearance</h3>
        <p className="text-sm text-[#94A3B8] mb-6">Customize your visual experience</p>

        <div className="space-y-5">
          <div>
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-4 mt-3">
              {[
                { id: 'dark', label: 'Dark', desc: 'Default dark theme' },
                { id: 'light', label: 'Light', desc: 'Light theme' },
                { id: 'auto', label: 'Auto', desc: 'Follow system preference' },
              ].map((theme) => (
                <button
                  key={theme.id}
                  className={`p-4 rounded-xl border text-left transition-all ${theme.id === 'dark'
                    ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-400/20 text-white shadow-md shadow-cyan-500/25'
                    : 'bg-background-elevated/40 border-border-default hover:border-primary/30 text-text-muted'
                    }`}
                >
                  <p className="text-sm font-medium">{theme.label}</p>
                  <p className="text-xs mt-1 opacity-70">{theme.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Font Size</Label>
            <div className="mt-2">
              <CustomSelect
                options={[
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                ]}
                value={fontSize}
                onChange={setFontSize}
                accentColor="#3B82F6"
                height={44}
              />
            </div>
          </div>

          <div>
            <Label>Compact Mode</Label>
            <div className="flex items-center justify-between mt-3">
              <p className="text-sm text-[#94A3B8]">Reduce spacing for more content density</p>
              <button className="w-12 h-6 rounded-full bg-[#334155] relative">
                <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
