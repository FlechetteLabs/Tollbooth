/**
 * Sidebar navigation component
 */

import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { View } from '../../types';

interface NavItemProps {
  view: View;
  label: string;
  icon: string;
  badge?: number;
}

function NavItem({ view, label, icon, badge }: NavItemProps) {
  const { currentView, setCurrentView } = useAppStore();
  const isActive = currentView === view;

  return (
    <button
      onClick={() => setCurrentView(view)}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left',
        isActive
          ? 'bg-inspector-accent text-white'
          : 'text-inspector-muted hover:bg-inspector-surface hover:text-inspector-text'
      )}
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-inspector-error text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar() {
  const { wsConnected, pendingIntercepts, pendingRefusals, traffic, conversations } = useAppStore();

  return (
    <aside className="w-64 bg-inspector-surface border-r border-inspector-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-inspector-border">
        <h1 className="text-lg font-bold text-inspector-text">LLM Inspector</h1>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              wsConnected ? 'bg-inspector-success' : 'bg-inspector-error'
            )}
          />
          <span className="text-sm text-inspector-muted">
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <NavItem
          view="traffic"
          label="Traffic"
          icon="📡"
          badge={traffic.size}
        />
        <NavItem
          view="conversations"
          label="Conversations"
          icon="💬"
          badge={conversations.size}
        />
        <NavItem
          view="intercept"
          label="Intercept"
          icon="🛑"
          badge={pendingIntercepts.size}
        />
        <NavItem
          view="refusals"
          label="Refusals"
          icon="🛡️"
          badge={pendingRefusals.size}
        />
        <NavItem view="data-store" label="Data Store" icon="💾" />
        <NavItem view="rules" label="Rules" icon="⚙️" />
        <NavItem view="chat" label="LLM Chat" icon="🤖" />
        <NavItem view="settings" label="Settings" icon="🔧" />
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-inspector-border">
        <p className="text-xs text-inspector-muted">
          Traffic flows through proxy at :8080
        </p>
      </div>
    </aside>
  );
}
