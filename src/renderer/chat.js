const DEFAULT_PROMPTS = {
  all: [
    { icon: '*', label: 'Explain this concept', text: 'Explain this concept in simple terms: ' },
    { icon: '*', label: 'Debug my code', text: 'Debug the following code and explain what is wrong:\n\n' },
    { icon: '*', label: 'Summarize this text', text: 'Summarize the following text concisely:\n\n' },
    { icon: '*', label: 'Analyze this data', text: 'Analyze the following data and give key insights:\n\n' },
    { icon: '*', label: 'Draft an email', text: 'Draft a professional email about: ' },
    { icon: '*', label: 'Translate to English', text: 'Translate the following to English:\n\n' },
  ],
  code: [
    { icon: '*', label: 'Debug my code', text: 'Debug the following code and explain what is wrong:\n\n' },
    { icon: '*', label: 'Refactor my code', text: 'Refactor the following code for readability and performance:\n\n' },
    { icon: '*', label: 'Write unit tests', text: 'Write unit tests for the following function:\n\n' },
    { icon: '*', label: 'Add comments', text: 'Add clear inline comments to this code:\n\n' },
    { icon: '*', label: 'Optimize performance', text: 'Optimize the following code for better performance:\n\n' },
    { icon: '*', label: 'Security review', text: 'Review the following code for security vulnerabilities:\n\n' },
  ],
  write: [
    { icon: '*', label: 'Draft an email', text: 'Draft a professional email about: ' },
    { icon: '*', label: 'Summarize this text', text: 'Summarize the following text concisely:\n\n' },
    { icon: '*', label: 'Improve my writing', text: 'Improve the clarity and tone of this text:\n\n' },
    { icon: '*', label: 'Write a tweet', text: 'Write a concise and engaging tweet about: ' },
    { icon: '*', label: 'Create a report', text: 'Create a structured report on: ' },
    { icon: '*', label: 'Write a bio', text: 'Write a professional bio for someone who: ' },
  ],
  analyze: [
    { icon: '*', label: 'Analyze this data', text: 'Analyze the following data and give key insights:\n\n' },
    { icon: '*', label: 'Pros and cons', text: 'List the pros and cons of: ' },
    { icon: '*', label: 'Compare options', text: 'Compare and contrast the following options:\n\n' },
    { icon: '*', label: 'Trend analysis', text: 'Identify trends in the following information:\n\n' },
    { icon: '*', label: 'Root cause analysis', text: 'Perform a root cause analysis of this problem: ' },
  ],
  research: [
    { icon: '*', label: 'Explain this concept', text: 'Explain this concept in simple terms: ' },
    { icon: '*', label: 'Translate to English', text: 'Translate the following to English:\n\n' },
    { icon: '*', label: 'Literature summary', text: 'Summarize current knowledge on: ' },
    { icon: '*', label: 'Fact check this', text: 'Fact check and verify the following claim: ' },
    { icon: '*', label: 'Suggest resources', text: 'Suggest learning resources for: ' },
  ],
};

export class ChatController {
  inputEl = null;
  messagesContainer = null;
  abortController = null;
  promptHistory = [];
  options = {};
  analyticsEl = null;
  usageMetrics = { status: 'idle', tools: 0, model: 'n/a', latencyMs: 0, turns: 0 };

  constructor() {
    this.refreshDomRefs();
    void this.hydrateLocalState();
  }

  refreshDomRefs() {
    this.inputEl = document.getElementById('chatInput');
    this.messagesContainer = document.getElementById('chatMessages');
  }

  async hydrateLocalState() {
    await Promise.all([this.loadPromptHistory(), this.loadOptions()]);
  }

  getCurrentAgent() { return document.getElementById('agentSelect')?.value || 'auto'; }
  getCurrentModelType() { return document.getElementById('modelTypeSelect')?.value || 'smart'; }

  getActiveToolsFromUI() {
    return Array.from(document.querySelectorAll('.tool-btn.active, .btn-tool.active, .toolbar-btn.active, [data-tool].active'))
      .map(btn => btn.getAttribute('data-tool') || btn.textContent?.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
  }

  async sendMessage(activeTools = []) {
    this.refreshDomRefs();
    if (window.streamState.isGenerating || !this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    if (!window.state.currentChatId) this.createNewSession(text);

    this.addMessage('user', text);
    window.state.messages.push({ role: 'user', content: text });
    this.syncCurrentChatRecord();

    this.addToPromptHistory(text);
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    await this.requestAgentResponse(text, activeTools);
  }

  applyDefaultPrompt(promptText) {
    if (!this.inputEl) return;
    this.inputEl.value = promptText;
    this.inputEl.focus();
    const len = promptText.length;
    this.inputEl.setSelectionRange(len, len);
  }

  setOption(_k, _v) {}

  stopGeneration() {
    if (!this.abortController) return;
    this.abortController.abort();
    this.abortController = null;
  }

  resetComposerState() {
    this.refreshDomRefs();
    this.stopGeneration();
    window.streamState.isGenerating = false;
    this.toggleLoading(false);
    const input = this.inputEl || document.getElementById('chatInput');
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.removeAttribute('disabled');
    input.removeAttribute('readonly');
    input.style.pointerEvents = 'auto';
    input.placeholder = 'Message... (Shift+Enter for newline)';
    input.focus();
  }

  renderDefaultPrompts(container, category = 'all') {
    if (!container) return;
    container.innerHTML = '';
    const tabBar = document.createElement('div');
    tabBar.className = 'prompt-category-tabs';

    Object.keys(DEFAULT_PROMPTS).forEach(cat => {
      const tab = document.createElement('button');
      tab.className = `prompt-cat-tab${cat === category ? ' active' : ''}`;
      tab.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      tab.addEventListener('click', () => this.renderDefaultPrompts(container, cat));
      tabBar.appendChild(tab);
    });
    container.appendChild(tabBar);

    const grid = document.createElement('div');
    grid.className = 'prompt-chip-grid';
    (DEFAULT_PROMPTS[category] ?? DEFAULT_PROMPTS.all).forEach(({ icon, label, text }) => {
      const chip = document.createElement('button');
      chip.className = 'prompt-chip';
      chip.innerHTML = `<span class="prompt-chip-icon">${icon}</span><span>${label}</span>`;
      chip.addEventListener('click', () => this.applyDefaultPrompt(text));
      grid.appendChild(chip);
    });
    container.appendChild(grid);
  }

  renderOptionsBar(container) {
    if (!container) return;
    this.analyticsEl = container;
    this.analyticsEl.innerHTML = '';
    this.analyticsEl.style.display = 'none';
  }

  renderUsageAnalytics() {
    if (!this.analyticsEl) return;
    const totalMessages = Array.isArray(window.state?.messages) ? window.state.messages.length : 0;
    this.usageMetrics.turns = Math.floor(totalMessages / 2);
    this.analyticsEl.innerHTML = `
      <div class="usage-analytics-row">
        <span class="usage-pill usage-pill-status usage-${this.usageMetrics.status}">${this.usageMetrics.status.toUpperCase()}</span>
        <span class="usage-pill">Turns: ${this.usageMetrics.turns}</span>
        <span class="usage-pill">Tools: ${this.usageMetrics.tools}</span>
        <span class="usage-pill usage-pill-model" title="${this.usageMetrics.model}">Model: ${this.usageMetrics.model}</span>
        <span class="usage-pill">Latency: ${this.usageMetrics.latencyMs}ms</span>
      </div>
    `;
  }

  createNewSession(titleText) {
    const newId = `c_${Date.now()}`;
    const newChat = {
      id: newId,
      title: titleText.substring(0, 30) + (titleText.length > 30 ? '...' : ''),
      timestamp: new Date().toISOString(),
      messages: [],
    };
    window.appData.chatHistory.unshift(newChat);
    window.state.currentChatId = newId;
    this.renderRecentChats();
  }

  syncCurrentChatRecord() {
    const chat = window.appData.chatHistory.find(c => c.id === window.state.currentChatId);
    if (!chat) return;
    chat.messages = window.state.messages;
    chat.timestamp = new Date().toISOString();
    this.saveHistory();
    this.renderUsageAnalytics();
  }

  addMessage(role, content, opts = {}) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.remove();
    if (!this.messagesContainer) return null;

    const isUser = role === 'user';
    const userName = window.state.user?.username || 'Guest';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user' : ''}`;

    const avatarEl = document.createElement('div');
    avatarEl.className = `msg-avatar ${isUser ? 'user-av' : 'ai'}`;
    avatarEl.textContent = isUser ? userName.charAt(0).toUpperCase() : '*';

    const body = document.createElement('div');
    body.className = 'msg-body';

    if (!isUser) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      const modelTag = String(opts.model || this.getCurrentAgent()).toUpperCase();
      sender.innerHTML = `<span>NeuralDesk</span><span class="model-tag">${modelTag}</span>`;
      body.appendChild(sender);
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isUser ? 'user-msg' : 'ai'}`;
    if (opts.isError) bubble.classList.add('error-msg');

    const msgContent = document.createElement('div');
    if (opts.id) msgContent.id = opts.id;
    if (opts.streaming) msgContent.className = 'streaming-cursor';

    if (window.renderer) window.renderer.render(content, msgContent, { skipHighlight: opts.skipHighlight });
    else msgContent.textContent = content;

    bubble.appendChild(msgContent);
    body.appendChild(bubble);

    if (isUser) {
      row.appendChild(body);
      row.appendChild(avatarEl);
    } else {
      row.appendChild(avatarEl);
      row.appendChild(body);
    }

    this.messagesContainer.appendChild(row);
    if (!opts.skipScroll) this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    return msgContent;
  }

  buildSystemHint() { return ''; }

  async requestAgentResponse(input, tools = [], overrides = {}) {
    const requestStartedAt = Date.now();
    window.streamState.isGenerating = true;
    this.toggleLoading(true);
    this.abortController = new AbortController();
    this.usageMetrics.status = 'running';
    this.usageMetrics.tools = Array.isArray(tools) ? tools.length : 0;
    this.renderUsageAnalytics();

    const agent = overrides.agent || this.getCurrentAgent();
    const modelType = overrides.model || this.getCurrentModelType();

    try {
      const response = await window.electronAPI.askAI({
        input,
        chatId: window.state.currentChatId,
        agent,
        modelType,
        systemHint: this.buildSystemHint(),
        tools,
        options: {},
        aipipeToken: window.aipipeToken || null,
      });

      if (typeof response === 'string' && response.startsWith('Error')) {
        this.addMessage('assistant', response, { isError: true });
        this.usageMetrics.status = 'error';
        return;
      }

      const finalOutput = response?.text || '';
      this.addMessage('assistant', finalOutput, { model: response.model, mcpResults: response.mcpResults });
      this.usageMetrics.model = response?.model || this.getCurrentModelType() || 'n/a';
      this.usageMetrics.latencyMs = Date.now() - requestStartedAt;
      this.usageMetrics.status = 'ok';

      window.state.messages.push({ role: 'assistant', content: finalOutput });
      this.syncCurrentChatRecord();
    } catch (error) {
      if (error?.name === 'AbortError') {
        this.addMessage('assistant', '_Generation stopped._');
        this.usageMetrics.status = 'stopped';
      } else {
        console.error('Chat Error:', error);
        this.addMessage('assistant', `Error: ${error instanceof Error ? error.message : String(error)}`, { isError: true });
        this.usageMetrics.status = 'error';
      }
    } finally {
      window.streamState.isGenerating = false;
      this.abortController = null;
      this.toggleLoading(false);
      this.renderUsageAnalytics();
    }
  }

  retryLastMessage(btnEl = null) {
    if (window.streamState.isGenerating) return;
    if (btnEl) btnEl.classList.add('loading');

    const lastUserMsg = [...window.state.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    setTimeout(() => {
      const rows = this.messagesContainer?.querySelectorAll('.message-row') || [];
      const lastRow = rows[rows.length - 1];
      if (lastRow && (lastRow.querySelector('.error-msg') || lastRow.textContent.toLowerCase().includes('error'))) {
        lastRow.remove();
      }
      this.requestAgentResponse(lastUserMsg.content, this.getActiveToolsFromUI());
    }, 200);
  }

  toggleLoading(show) {
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (show) {
      sendBtn?.classList.add('hidden');
      stopBtn?.classList.remove('hidden');
    } else {
      sendBtn?.classList.remove('hidden');
      stopBtn?.classList.add('hidden');
    }
  }

  saveHistory() { void window.electronAPI.saveData('chatHistory', window.appData.chatHistory); }
  renderRecentChats() { if (typeof window.renderHistory === 'function') window.renderHistory(); }

  addToPromptHistory(text) {
    this.promptHistory = [text, ...this.promptHistory.filter(p => p !== text)].slice(0, 20);
    void this.persistPromptHistory();
  }

  async persistPromptHistory() {
    try { await window.electronAPI?.saveData?.('promptHistory', this.promptHistory); } catch (_) {}
  }

  async loadPromptHistory() {
    try {
      const saved = await window.electronAPI?.getData?.('promptHistory');
      if (Array.isArray(saved)) this.promptHistory = saved;
    } catch (_) {}
  }

  async persistOptions() {
    try { await window.electronAPI?.saveData?.('chatOptions', this.options); } catch (_) {}
  }

  async loadOptions() {
    try {
      const saved = await window.electronAPI?.getData?.('chatOptions');
      if (!saved || typeof saved !== 'object') return;
      this.options = {};
    } catch (_) {}
  }
}

export const chatController = new ChatController();
