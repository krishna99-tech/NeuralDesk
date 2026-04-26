/**
 * NeuralDesk Global State Management
 * Aligned with the production session architecture.
 */
window.state = {
  user: null,
  currentChatId: null,
  messages: [],
  currentView: 'chat',
  activeSettings: 'general',
  rightPanelOpen: true,
  nodeCount: 0,
  nodes: [],
  connections: [],
  activeModels: [],
  runtimeSettings: null,
  // Session data for the active chat (mirrors backend session store)
  sessionData: {
    lastIntent: '',
    chartData: null
  }
};

window.appData = {
  mcps: { panel: [], settings: [] },
  config: null,
  chatHistory: [],
  responses: [],
  nodes: [],
  agentConfig: null,
  // Per-chat session cache (keyed by chatId)
  sessionCache: {}
};

window.streamState = {
  isGenerating: false,
  activeRequestId: null,
  pending: new Map(),
  unsubscribe: null
};

window.connectionState = {
  checking: false,
  lastModel: ''
};
