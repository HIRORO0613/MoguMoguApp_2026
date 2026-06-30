import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' };

export function Card({ children, className = '', onClick, padding = 'md' }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={[
        'bg-white rounded-2xl shadow-sm border border-gray-100',
        onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : '',
        PADDING[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
