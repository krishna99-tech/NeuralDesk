/**
 * NeuralDesk Global Type Definitions
 */

interface Window {
  state: {
    user: any;
    currentChatId: string | null;
    messages: Array<{ role: string; content: string }>;
    currentView: string;
    rightPanelOpen: boolean;
    runtimeSettings: any;
  };
  appData: {
    chatHistory: any[];
    mcps: {
      settings: any[];
    };
  };
  db: {
    saveSettings: (settings: any) => Promise<any>;
    getSettings: () => Promise<any>;
    find: (table: string) => Promise<any[]>;
  };
  renderer: {
    render: (text: string, container: HTMLElement) => void;
    extractArtifacts: (text: string) => string;
    artifacts: Record<string, any>;
  };
  electronAPI: any;
  api: any;
}

declare const marked: any;
declare const Prism: any;
declare const Chart: any;
declare function showToast(msg: string, type?: string): void;
declare function renderRecentChats(): void;
declare function renderMemory(): void;
declare function renderKeys(): void;
declare function loadMcpServers(): void;
declare function renderActiveTools(): void;
declare function checkConnection(): void;
declare function onModelChange(): void;
