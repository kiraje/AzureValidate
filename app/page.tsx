'use client';
import { useState } from 'react';
import { PillSwitcher } from './components/PillSwitcher';
import { ValidateTab } from './components/ValidateTab';
import { DeviceAuthTab } from './components/DeviceAuthTab';
import { WebhooksTab } from './components/WebhooksTab';

type Tab = 'validate' | 'device-auth' | 'webhooks';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('validate');

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase">
            Azure Validator
          </span>
          <span className="text-xs text-zinc-700 font-mono border border-zinc-800 rounded px-2 py-0.5">
            internal
          </span>
        </div>

        {/* Pill switcher */}
        <div className="flex justify-center">
          <PillSwitcher active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Tab content */}
        <div className="mt-2">
          {activeTab === 'validate' && <ValidateTab />}
          {activeTab === 'device-auth' && (
            <DeviceAuthTab onValidate={(credentials, subscriptionId) => {
              console.log('Device auth complete', { credentials, subscriptionId });
            }} />
          )}
          {activeTab === 'webhooks' && <WebhooksTab />}
        </div>
      </div>
    </div>
  );
}
