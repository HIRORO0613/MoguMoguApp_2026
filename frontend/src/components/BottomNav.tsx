import { NavLink } from 'react-router-dom';
import { Home, BarChart2, MessageCircle, Settings } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface NavItem {
  to: string;
  icon: ComponentType<LucideProps>;
  label: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', icon: Home, label: 'ホーム', end: true },
  { to: '/history', icon: BarChart2, label: '記録' },
  { to: '/chat', icon: MessageCircle, label: 'チャット' },
  { to: '/settings', icon: Settings, label: '設定' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 safe-area-pb max-w-md mx-auto">
      <div className="flex">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors',
                isActive ? 'text-[#233F9A]' : 'text-gray-400 hover:text-gray-600',
              ].join(' ')
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
