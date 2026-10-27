import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && <label className="text-xs font-medium text-studio-muted">{label}</label>}
        <input
          ref={ref}
          className={`h-9 px-3 rounded bg-studio-subbg border border-studio-border text-sm text-studio-text placeholder-zinc-500 focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-colors ${
            error ? 'border-studio-error' : ''
          } ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-studio-error">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
