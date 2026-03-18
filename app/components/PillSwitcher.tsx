'use client';

type Tab = 'validate' | 'device-auth' | 'webhooks';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'validate', label: 'Validate' },
  { id: 'device-auth', label: 'Device Auth' },
  { id: 'webhooks', label: 'Webhooks' },
];

export function PillSwitcher({ active, onChange }: Props) {
  return (
    <div className="flex gap-0.5 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${
            active === tab.id
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
