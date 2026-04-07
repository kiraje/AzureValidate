'use client';

type Status = 'pending' | 'running' | 'passed' | 'failed';

interface PermRow {
  key: string;
  label: string;
}

const PERMISSIONS: PermRow[] = [
  { key: 'resource_group_create', label: 'Resource Group' },
  { key: 'storage_account_create', label: 'Storage Account' },
  { key: 'static_website_enable', label: 'Static Website' },
  { key: 'blob_container_create', label: 'Blob Container' },
  { key: 'blob_upload', label: 'File Upload' },
  { key: 'storage_account_delete', label: 'Cleanup' },
];

interface Props {
  statuses: Record<string, Status>;
  total: number;
  running: boolean;
}

const statusClass: Record<Status, string> = {
  pending: 'text-zinc-600',
  running: 'text-amber-500',
  passed: 'text-emerald-500',
  failed: 'text-red-400',
};

const statusLabel: Record<Status, string> = {
  pending: 'pending',
  running: 'running…',
  passed: 'passed',
  failed: 'failed',
};

export function PermissionChecklist({ statuses, total, running }: Props) {
  const passedCount = Object.values(statuses).filter(s => s === 'passed').length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400 font-medium">{running ? 'Validation running…' : 'Validation checks'}</span>
        <span className="text-xs font-mono text-zinc-600">{passedCount} / {total}</span>
      </div>
      <div className="divide-y divide-zinc-800/60">
        {PERMISSIONS.map(({ key, label }) => {
          const status: Status = statuses[key] ?? 'pending';
          return (
            <div key={key} className="flex items-center justify-between py-2">
              <span className="text-xs text-zinc-400">{label}</span>
              <span className={`text-xs font-medium ${statusClass[status]}`}>
                {statusLabel[status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
