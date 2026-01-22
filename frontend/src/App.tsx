/**
 * Main App component
 */

import { useAppStore } from './stores/appStore';
import { useWebSocket } from './hooks/useWebSocket';
import { Sidebar } from './components/layout/Sidebar';
import { TrafficListView } from './components/traffic/TrafficListView';
import { TrafficDetailView } from './components/traffic/TrafficDetailView';
import { ConversationListView } from './components/conversation/ConversationListView';
import { ConversationDetailView } from './components/conversation/ConversationDetailView';
import { InterceptQueueView } from './components/intercept/InterceptQueueView';
import { PendingRefusalsView } from './components/refusal/PendingRefusalsView';
import { DataStoreView } from './components/data-store/DataStoreView';
import { RulesView } from './components/rules/RulesView';
import { ChatView } from './components/chat/ChatView';
import { SettingsView } from './components/settings/SettingsView';

function MainContent() {
  const { currentView } = useAppStore();

  switch (currentView) {
    case 'traffic':
      return (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-1/2 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <TrafficListView />
          </div>
          <div className="w-1/2 min-w-0 overflow-hidden">
            <TrafficDetailView />
          </div>
        </div>
      );

    case 'conversations':
      return (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-1/3 flex flex-col min-h-0 min-w-0 overflow-hidden border-r border-inspector-border">
            <ConversationListView />
          </div>
          <div className="w-2/3 min-w-0 overflow-hidden">
            <ConversationDetailView />
          </div>
        </div>
      );

    case 'intercept':
      return <InterceptQueueView />;

    case 'refusals':
      return <PendingRefusalsView />;

    case 'data-store':
      return <DataStoreView />;

    case 'rules':
      return <RulesView />;

    case 'chat':
      return <ChatView />;

    case 'settings':
      return <SettingsView />;

    default:
      return null;
  }
}

function App() {
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <div className="h-screen flex bg-inspector-bg text-inspector-text">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <MainContent />
      </main>
    </div>
  );
}

export default App;
