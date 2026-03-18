'use client';
import { useState, useEffect } from 'react';

interface WebhookConfig {
  url: string | null;
  enabled: boolean;
  has_secret: boolean;
  updated_at: string | null;
}

interface Delivery {
  id: string;
  validation_id: string;
  http_status: number | null;
  success: boolean;
  attempted_at: string;
}

function formatRelativeTime(dateString: string): string {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function WebhooksTab() {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [secretHeader, setSecretHeader] = useState('');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showTestMsg, setShowTestMsg] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      try {
        const [configRes, deliveriesRes] = await Promise.all([
          fetch('/api/webhooks/config', { signal: controller.signal }),
          fetch('/api/webhooks/deliveries', { signal: controller.signal }),
        ]);

        if (configRes.ok) {
          const config: WebhookConfig = await configRes.json();
          setUrl(config.url ?? '');
          setEnabled(config.enabled);
          // secret is write-only — never populate the input
        }

        if (deliveriesRes.ok) {
          const data = await deliveriesRes.json();
          setDeliveries(data.deliveries ?? []);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    loadData();
    return () => controller.abort();
  }, []);

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError('');
    setShowTestMsg(false);

    try {
      const body: Record<string, unknown> = { url, enabled };
      if (secretHeader.trim() !== '') {
        body.secret_header = secretHeader;
      }

      const res = await fetch('/api/webhooks/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveStatus('error');
        setSaveError(data.error ?? 'Save failed');
        return;
      }

      setSaveStatus('saved');
      setSecretHeader(''); // clear after successful save
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(String(err));
    }
  }

  function handleTest() {
    setShowTestMsg(true);
    setTimeout(() => setShowTestMsg(false), 4000);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-5">
      {/* Configuration section */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Configuration</h3>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-200">Enable webhook</p>
            <p className="text-xs text-zinc-500">Fire on every validation result</p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-green-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Endpoint URL */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Endpoint URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        {/* Secret header */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Secret Header <span className="normal-case text-zinc-600">(optional)</span>
          </label>
          <input
            type="password"
            value={secretHeader}
            onChange={(e) => setSecretHeader(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="px-4 py-1.5 rounded bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            className="px-4 py-1.5 rounded border border-zinc-700 text-zinc-300 text-sm hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            Test ↗
          </button>

          {saveStatus === 'saved' && (
            <span className="text-xs text-green-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">{saveError || 'Error saving'}</span>
          )}
          {showTestMsg && (
            <span className="text-xs text-zinc-500">Test feature coming soon</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Recent Deliveries */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">Recent Deliveries</h3>

        {deliveries.length === 0 ? (
          <p className="text-sm text-zinc-600">No deliveries yet</p>
        ) : (
          <ul className="space-y-1.5">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                {/* Status dot */}
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    d.success ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                {/* Status text */}
                <span className={`font-mono text-xs ${d.success ? 'text-green-400' : 'text-red-400'}`}>
                  {d.success
                    ? `${d.http_status ?? 200} OK`
                    : d.http_status
                    ? `${d.http_status} error`
                    : 'timeout'}
                </span>
                {/* Separator */}
                <span className="text-zinc-600">—</span>
                {/* Validation ID (truncated) */}
                <span className="text-zinc-500 font-mono text-xs truncate flex-1">
                  validation {d.validation_id.slice(0, 4)}…
                </span>
                {/* Relative time */}
                <span className="text-zinc-600 text-xs flex-shrink-0">
                  {formatRelativeTime(d.attempted_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
