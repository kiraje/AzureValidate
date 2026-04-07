'use client';
import { useState } from 'react';
import { PillSwitcher } from './components/PillSwitcher';
import { ValidateTab } from './components/ValidateTab';
import { DeviceAuthTab } from './components/DeviceAuthTab';
import { WebhooksTab } from './components/WebhooksTab';

type Tab = 'validate' | 'device-auth' | 'webhooks';

interface PendingCredentials {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  display_name?: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('validate');
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredentials | undefined>(undefined);
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | undefined>(undefined);

  function handleDeviceAuthValidate(
    credentials: PendingCredentials,
    subscriptionId: string
  ) {
    setPendingCredentials(credentials);
    setPendingSubscriptionId(subscriptionId);
    setActiveTab('validate');
  }

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
          {activeTab === 'validate' && (
            <ValidateTab
              initialCredentials={pendingCredentials}
              initialSubscriptionId={pendingSubscriptionId}
              onInitialCredentialsConsumed={() => {
                setPendingCredentials(undefined);
                setPendingSubscriptionId(undefined);
              }}
            />
          )}
          {activeTab === 'device-auth' && (
            <DeviceAuthTab onValidate={handleDeviceAuthValidate} />
          )}
          {activeTab === 'webhooks' && <WebhooksTab />}
        </div>
      </div>
    </div>
  );
}
