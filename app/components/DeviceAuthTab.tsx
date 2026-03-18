'use client';
import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeviceAuthTabProps {
  onValidate?: (
    credentials: { tenant_id: string; client_id: string; client_secret: string; display_name?: string },
    subscriptionId: string
  ) => void;
}

type Step = 1 | 2 | 3;

interface DeviceCodeInfo {
  session_id: string;
  user_code: string;
  verification_url: string;
}

interface ServicePrincipalInfo {
  appId: string;
  displayName: string;
  password: string;
  tenant: string;
  subscriptionId: string;
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps = [1, 2, 3] as const;
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((n, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border',
                done && 'bg-green-600 border-green-600 text-white',
                active && 'bg-white border-white text-zinc-900',
                !done && !active && 'bg-zinc-800 border-zinc-700 text-zinc-500'
              )}
            >
              {done ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                n
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'w-10 h-px',
                  n < current ? 'bg-green-600' : 'bg-zinc-700'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeviceAuthTab({ onValidate }: DeviceAuthTabProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [spName, setSpName] = useState('');
  const [sp, setSp] = useState<ServicePrincipalInfo | null>(null);

  // ── Step 1: start device auth ──────────────────────────────────────────────

  const startDeviceAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/device-auth/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start device auth');
        return;
      }
      setDeviceCode({
        session_id: data.session_id,
        user_code: data.user_code,
        verification_url: data.verification_url,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-start on mount
  useEffect(() => {
    startDeviceAuth();
  }, [startDeviceAuth]);

  const copyCode = useCallback(async () => {
    if (!deviceCode) return;
    await navigator.clipboard.writeText(deviceCode.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [deviceCode]);

  // ── Step 2: create service principal ──────────────────────────────────────

  const createSp = useCallback(async () => {
    if (!deviceCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/device-auth/${deviceCode.session_id}/create-sp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spName || 'AzureValidatorSP' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create service principal');
        return;
      }
      setSp({
        appId: data.service_principal.appId,
        displayName: data.service_principal.displayName,
        password: data.service_principal.password,
        tenant: data.service_principal.tenant,
        subscriptionId: data.subscription_id,
      });
      setStep(3);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [deviceCode, spName]);

  // ── Step 3: validate ───────────────────────────────────────────────────────

  const handleValidateNow = useCallback(() => {
    if (!sp) return;
    onValidate?.(
      {
        tenant_id: sp.tenant,
        client_id: sp.appId,
        client_secret: sp.password,
        display_name: sp.displayName,
      },
      sp.subscriptionId
    );
  }, [sp, onValidate]);

  const startOver = useCallback(() => {
    setStep(1);
    setDeviceCode(null);
    setSp(null);
    setSpName('');
    setError(null);
    setCopied(false);
    startDeviceAuth();
  }, [startDeviceAuth]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      <StepIndicator current={step} />

      {/* Error banner */}
      {error && (
        <div className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-100">Sign in with Azure</h2>

          {loading && !deviceCode && (
            <p className="text-xs text-zinc-500">Starting device authentication…</p>
          )}

          {deviceCode && (
            <>
              {/* Code box */}
              <div className="rounded border border-zinc-700 bg-zinc-950 px-4 py-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Enter this code at the URL below</p>
                <p className="font-mono text-2xl font-bold tracking-widest text-white">
                  {deviceCode.user_code}
                </p>
              </div>

              {/* Verification URL */}
              <p className="text-xs text-zinc-500 text-center">
                <a
                  href={deviceCode.verification_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  {deviceCode.verification_url}
                </a>
              </p>

              <p className="text-xs text-zinc-500 text-center">Waiting for authentication…</p>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={copyCode}
                  className="flex-1 py-2 text-xs font-medium border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy code'}
                </button>
                <a
                  href={deviceCode.verification_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 text-xs font-medium border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-center"
                >
                  Open URL ↗
                </a>
              </div>

              {/* Manual advance button */}
              <button
                onClick={() => setStep(2)}
                className="w-full py-2 text-xs font-medium bg-white text-zinc-900 rounded hover:bg-zinc-100 transition-colors"
              >
                I&apos;ve authenticated →
              </button>
            </>
          )}

          {/* Retry on error */}
          {error && (
            <button
              onClick={startDeviceAuth}
              disabled={loading}
              className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-100">Create service principal</h2>
          <p className="text-xs text-zinc-500">
            Choose a name for the service principal to create in your Azure account.
          </p>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Service principal name</label>
            <input
              type="text"
              value={spName}
              onChange={(e) => setSpName(e.target.value)}
              placeholder="my-app-sp"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <button
            onClick={createSp}
            disabled={loading}
            className="w-full py-2 text-xs font-medium bg-white text-zinc-900 rounded hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Service Principal'}
          </button>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && sp && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-100">Service principal created</h2>
          <p className="text-xs text-zinc-500">
            Your service principal has been created. Review the details below before validating.
          </p>

          <div className="rounded border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800">
            <div className="flex items-start px-3 py-2">
              <span className="text-xs text-zinc-500 w-24 flex-shrink-0 pt-0.5">Client ID</span>
              <span className="font-mono text-xs text-zinc-200 break-all">{sp.appId}</span>
            </div>
            <div className="flex items-start px-3 py-2">
              <span className="text-xs text-zinc-500 w-24 flex-shrink-0 pt-0.5">Tenant ID</span>
              <span className="font-mono text-xs text-zinc-200 break-all">{sp.tenant}</span>
            </div>
            <div className="flex items-start px-3 py-2">
              <span className="text-xs text-zinc-500 w-24 flex-shrink-0 pt-0.5">Display name</span>
              <span className="font-mono text-xs text-zinc-200 break-all">{sp.displayName}</span>
            </div>
          </div>

          <button
            onClick={handleValidateNow}
            className="w-full py-2 text-xs font-medium bg-white text-zinc-900 rounded hover:bg-zinc-100 transition-colors"
          >
            Validate Now →
          </button>

          <button
            onClick={startOver}
            className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
