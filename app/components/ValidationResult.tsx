'use client';

interface Props {
  isValid: boolean;
  errors: string[];
}

export function ValidationResult({ isValid, errors }: Props) {
  return (
    <div className={`rounded-md border p-3 space-y-1 ${
      isValid
        ? 'border-emerald-800/50 bg-emerald-950/30'
        : 'border-red-800/50 bg-red-950/30'
    }`}>
      <p className={`text-xs font-semibold ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
        {isValid ? '✓ All permissions validated' : '✗ Validation failed'}
      </p>
      {errors.length > 0 && (
        <ul className="space-y-0.5">
          {errors.map((err, i) => (
            <li key={i} className="text-xs text-zinc-500">{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
