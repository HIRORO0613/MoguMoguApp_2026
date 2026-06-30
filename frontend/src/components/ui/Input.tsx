import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  rightElement?: React.ReactNode;
}

export function Input({ label, error, hint, rightElement, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="relative">
        <input
          className={[
            'w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900',
            'placeholder-gray-400 outline-none transition-colors duration-150',
            error
              ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-100'
              : 'border-gray-200 focus:border-[#00B5F0] focus:ring-2 focus:ring-[#e0f7fe]',
            rightElement ? 'pr-12' : '',
            'disabled:bg-gray-50 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...rest}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
        )}
      </div>
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
