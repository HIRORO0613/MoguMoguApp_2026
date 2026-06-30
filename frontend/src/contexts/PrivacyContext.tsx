import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface PrivacyContextValue {
  isPrivate: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  isPrivate: false,
  toggle: () => {},
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);
  return (
    <PrivacyContext.Provider value={{ isPrivate, toggle: () => setIsPrivate(v => !v) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);

/** センシティブな値をプライバシーモード時に隠すラッパー */
export function PrivacyValue({
  children,
  mask = '●●●',
  className = '',
}: {
  children: ReactNode;
  mask?: string;
  className?: string;
}) {
  const { isPrivate } = usePrivacy();
  if (isPrivate) {
    return (
      <span className={`tracking-[0.25em] text-gray-300 select-none ${className}`}>
        {mask}
      </span>
    );
  }
  return <>{children}</>;
}
