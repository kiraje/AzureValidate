'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CredentialInput } from './CredentialInput';
import { PermissionChecklist } from './PermissionChecklist';
import { ValidationResult } from './ValidationResult';

type PermStatus = 'pending' | 'running' | 'passed' | 'failed';

interface ValidationState {
  running: boolean;
  statuses: Record<string, PermStatus>;
  result: { isValid: boolean; errors: string[] } | null;
}

interface Props {
  initialValidationId?: string;
  onStreamStarted?: () => void;
}

export function ValidateTab({ initialValidationId, onStreamStarted }: Props) {
  const [state, setState] = useState<ValidationState>({
    running: !!initialValidationId,
    statuses: {},
    result: null,
  });
  const esRef = useRef<EventSource | null>(null);

  const openStream = useCallback((id: string) => {
    onStreamStarted?.();
    const es = new EventSource(`/api/validate/${id}/stream`);
    esRef.current = es;

    // Server sends plain `data:` events (no named event type) so onmessage fires for all.
    // We also attach a named 'done' listener as belt-and-suspenders in case the protocol
    // ever adds explicit event types.
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.step === 'done') {
          es.close();
          esRef.current = null;
          setState(prev => ({
            running: false,
            statuses: prev.statuses,
            result: {
              isValid: data.status === 'complete',
              errors: data.errors ?? [],
            },
          }));
        } else {
          setState(prev => ({
            ...prev,
            statuses: { ...prev.statuses, [data.step]: data.status as PermStatus },
          }));
        }
      } catch { /* ignore parse errors */ }
    };

    es.onmessage = handleMessage;
    es.addEventListener('done', handleMessage as EventListener);

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        esRef.current = null;
        setState(prev => ({
          ...prev,
          running: false,
          result: { isValid: false, errors: ['Connection to server lost'] },
        }));
      }
      // Otherwise: transient error, browser will reconnect automatically
    };
  }, [onStreamStarted]);

  // If an initialValidationId is provided (from device auth), open stream immediately
  useEffect(() => {
    if (initialValidationId) {
      openStream(initialValidationId);
    }
    return () => {
      esRef.current?.close();
    };
  }, [initialValidationId, openStream]);

  function cancel() {
    esRef.current?.close();
    esRef.current = null;
    setState({ running: false, statuses: {}, result: null });
  }

  async function startValidation(
    credentials: { tenant_id: string; client_id: string; client_secret: string; display_name?: string },
    subscriptionId: string
  ) {
    setState({ running: true, statuses: {}, result: null });

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, subscription_id: subscriptionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setState({ running: false, statuses: {}, result: { isValid: false, errors: [data.error ?? 'Request failed'] } });
        return;
      }

      const { validation_id } = await res.json();
      openStream(validation_id);
    } catch (err) {
      setState({ running: false, statuses: {}, result: { isValid: false, errors: [String(err)] } });
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      <CredentialInput onValidCredentials={startValidation} disabled={state.running} />

      {(state.running || state.result) && (
        <>
          <div className="border-t border-zinc-800 pt-4">
            <PermissionChecklist statuses={state.statuses} total={6} running={state.running} />
          </div>

          {state.running && (
            <button onClick={cancel} className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Cancel
            </button>
          )}

          {state.result && <ValidationResult {...state.result} />}

          {!state.running && (
            <button
              onClick={() => setState({ running: false, statuses: {}, result: null })}
              className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Start Over
            </button>
          )}
        </>
      )}
    </div>
  );
}
