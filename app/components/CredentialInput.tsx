'use client';
import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ParsedCredentials {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  display_name?: string;
}

interface Props {
  onValidCredentials: (credentials: ParsedCredentials, subscriptionId: string) => void;
  disabled?: boolean;
  initialCredentials?: ParsedCredentials;
  initialSubscriptionId?: string;
}

function parseCredentials(raw: string): ParsedCredentials | null {
  try {
    const parsed = JSON.parse(raw.trim());
    // Azure CLI format: appId, password, tenant
    if (parsed.appId && parsed.password && parsed.tenant) {
      return {
        tenant_id: parsed.tenant,
        client_id: parsed.appId,
        client_secret: parsed.password,
        display_name: parsed.displayName || '',
      };
    }
    // Direct API format: tenant_id, client_id, client_secret
    if (parsed.tenant_id && parsed.client_id && parsed.client_secret) {
      return {
        tenant_id: parsed.tenant_id,
        client_id: parsed.client_id,
        client_secret: parsed.client_secret,
        display_name: parsed.display_name || '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function CredentialInput({ onValidCredentials, disabled = false, initialCredentials, initialSubscriptionId }: Props) {
  const [json, setJson] = useState(() =>
    initialCredentials ? JSON.stringify(initialCredentials, null, 2) : ''
  );
  const [subscriptionId, setSubscriptionId] = useState(initialSubscriptionId ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialCredentials) {
      setJson(JSON.stringify(initialCredentials, null, 2));
    }
  }, [initialCredentials]);

  useEffect(() => {
    if (initialSubscriptionId) {
      setSubscriptionId(initialSubscriptionId);
    }
  }, [initialSubscriptionId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const creds = parseCredentials(json);
    if (!creds) {
      setError('Enter valid Azure credentials JSON (Azure CLI format with appId/password/tenant, or API format with tenant_id/client_id/client_secret)');
      return;
    }
    if (!subscriptionId.trim()) {
      setError('Subscription ID is required');
      return;
    }

    onValidCredentials(creds, subscriptionId.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Service Principal JSON</label>
        <Textarea
          value={json}
          onChange={e => setJson(e.target.value)}
          placeholder='{"appId":"...","displayName":"...","password":"...","tenant":"..."}'
          className="font-mono text-xs h-20 resize-none"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Subscription ID</label>
        <Input
          value={subscriptionId}
          onChange={e => setSubscriptionId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="font-mono text-xs"
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button type="submit" className="w-full text-xs" disabled={disabled || !json || !subscriptionId}>
        Validate
      </Button>
    </form>
  );
}
