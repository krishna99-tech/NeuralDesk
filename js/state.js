/**
 * NeuralDesk Global State Management
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
  runtimeSettings: null
};

window.appData = {
  mcps: { panel: [], settings: [] },
  config: null,
  chatHistory: [],
  responses: [],
  nodes: [],
  agentConfig: null
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
