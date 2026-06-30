import React from 'react';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  rightAction?: React.ReactNode;
  /** チャット画面など、スクロールを自分で管理するページ用 */
  noScroll?: boolean;
}

export function Layout({ children, title, rightAction, noScroll = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col max-w-md mx-auto">
      {title && (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
          {rightAction && <div>{rightAction}</div>}
        </header>
      )}
      <main className={noScroll ? 'flex-1 flex flex-col overflow-hidden pb-16' : 'flex-1 overflow-y-auto pb-20'}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
