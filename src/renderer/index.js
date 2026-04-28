import { router } from './router.js';
import { chatController } from './chat.js';
import { authController } from './auth.js';
import { uiController } from './ui.js';
import { settingsController } from './settings.js';
import { toolUI } from './toolUI.js';
import { bindDataDrivenHandlers, collectActiveTools, escapeHtml, maskSecret, setInputValue } from './domUtils.js';
import { getProviderForAgent } from './agentProvider.js';

// Cached list for validation during save
let CACHED_MODELS = {};
let IS_BROWSER_FALLBACK = false;

function createBrowserFallbackApi() {
    const storagePrefix = 'nd_store_';
    return {
        askAI: async (payload) => ({
            text: `Browser demo mode: I received "${payload?.input || ''}". Start the desktop app with npm run dev for real AI responses.`,
            model: 'browser-demo',
            mcpResults: null
        }),
        getModels: async () => ({
            openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o', metadata: { 'gpt-4o-mini': { limit: '128k', price: '$0.15/1M' }, 'gpt-4o': { limit: '128k', price: '$2.50/1M' } } },
            claude: { fast: 'claude-3-5-haiku', smart: 'claude-3-5-sonnet', metadata: { 'claude-3-5-haiku': { limit: '200k', price: '$0.25/1M' }, 'claude-3-5-sonnet': { limit: '200k', price: '$3.00/1M' } } },
            gemini: { fast: 'gemini-1.5-flash', smart: 'gemini-1.5-pro', metadata: { 'gemini-1.5-flash': { limit: '1M', price: 'Free' }, 'gemini-1.5-pro': { limit: '2M', price: '$3.50/1M' } } },
            ollama: { fast: 'llama3', smart: 'llama3.3', metadata: { 'llama3.3': { limit: '128k', price: 'Local' }, 'llama3': { limit: '128k', price: 'Local' }, 'mistral': { limit: '32k', price: 'Local' } } },
            deepseek: { fast: 'deepseek-chat', smart: 'deepseek-reasoner', metadata: { 'deepseek-chat': { limit: '128k', price: '$0.14/1M' }, 'deepseek-reasoner': { limit: '64k', price: '$0.55/1M' } } },
            aipipe: { fast: 'openai/gpt-5-nano', smart: 'openai/gpt-5-nano', metadata: { 'openai/gpt-5-nano': { limit: '128k', price: '$0.10/1M' } } }
        }),
        saveData: async (key, data) => {
            localStorage.setItem(storagePrefix + key, JSON.stringify(data));
            return { ok: true };
        },
        getData: async (key) => {
            const raw = localStorage.getItem(storagePrefix + key);
            return raw ? JSON.parse(raw) : null;
        },
        getSettings: async () => {
            const raw = localStorage.getItem(storagePrefix + 'settings');
            return raw ? JSON.parse(raw) : null;
        },
        getMcpConfig: async () => {
            const raw = localStorage.getItem(storagePrefix + 'mcp_config');
            return raw ? JSON.parse(raw) : { mcpServers: {} };
        },
        saveMcpConfig: async (config) => {
            localStorage.setItem(storagePrefix + 'mcp_config', JSON.stringify(config || { mcpServers: {} }));
            return { ok: true, config };
        },
        getMcpStatuses: async () => ({}),
        openMcpConfigFile: async () => ({ ok: false, error: 'Not available in browser mode' }),
        onToolEvent: (_callback) => () => { },
        signup: async (creds) => ({ ok: true, user: { username: creds?.username || 'Guest' } }),
        login: async (creds) => ({ ok: true, user: { username: creds?.username || 'Guest' } }),
        checkSession: async () => ({ ok: true }),
        logout: async () => ({ ok: true }),
        clearSession: async (_chatId) => ({ ok: true }),
        clearChatHistory: async (_chatId) => ({ ok: true })
    };
}
if (!window.electronAPI) {
    window.electronAPI = createBrowserFallbackApi();
    IS_BROWSER_FALLBACK = true;
}
function showBrowserModeBanner() {
    const existing = document.getElementById('browserModeBanner');
    if (existing)
        return;
    const banner = document.createElement('div');
    banner.id = 'browserModeBanner';
    banner.className = 'browser-mode-banner';
    banner.textContent = 'Running in Browser Demo Mode. Desktop features (IPC, real auth, local runtime) are unavailable.';
    document.body.appendChild(banner);
}
function renderKeysPanel(settings) {
    const panel = document.getElementById('panelKeysList');
    if (!panel)
        return;
    const apiKeys = settings?.apiKeys || {};
    const defaultProvider = settings?.ai?.defaultProvider || '';
    const providerForKey = {
        openai: 'openai',
        anthropic: 'claude',
        gemini: 'gemini',
        deepseek: 'deepseek',
        aipipe: 'aipipe',
    };
    const keyDefs = [
        { id: 'openai', label: 'OpenAI' },
        { id: 'anthropic', label: 'Anthropic' },
        { id: 'gemini', label: 'Gemini' },
        { id: 'deepseek', label: 'DeepSeek' },
        { id: 'aipipe', label: 'AIpipe' },
    ];
    panel.innerHTML = keyDefs.map(({ id, label }) => {
        const value = String(apiKeys[id] || '').trim();
        const hasValue = value.length > 0;
        const isDefaultProvider = providerForKey[id] === defaultProvider;
        const status = hasValue ? 'running' : (isDefaultProvider ? 'setup' : 'missing');
        return `
      <div class="memory-item key-status key-status-${status}">
        <div class="memory-label">${escapeHtml(label)} <span class="key-status-badge key-status-badge-${status}">${status}</span></div>
        <div>${escapeHtml(maskSecret(value))}</div>
      </div>
    `;
    }).join('');
}
function applyTopbarState(state) {
    const topbar = state || {};
    setInputValue('agentSelect', topbar.selectedAgent || topbar.agent);
    setInputValue('modelTypeSelect', topbar.selectedModel || topbar.modelType);
    const badge = document.getElementById('connectionBadge');
    if (badge && topbar.connectionText) {
        const cls = String(topbar.connectionClass || '').trim();
        badge.textContent = topbar.connectionText;
        badge.className = cls || 'connection-badge';
    }
}
async function persistTopbarState() {
    const settings = window.appData.settings || {};
    settings.topbar = settings.topbar || {};
    settings.topbar.selectedAgent = document.getElementById('agentSelect')?.value || 'auto';
    settings.topbar.selectedModel = document.getElementById('modelTypeSelect')?.value || 'fast';
    const badge = document.getElementById('connectionBadge');
    settings.topbar.connectionText = badge?.textContent || 'Not checked';
    settings.topbar.connectionClass = badge?.className || 'connection-badge';
    window.appData.settings = settings;
    if (window.electronAPI?.saveData) {
        await window.electronAPI.saveData('settings', settings);
    }
}
function setToggleState(id, isOn) {
    const el = document.getElementById(`setting-${id}`);
    if (!el)
        return;
    el.classList.toggle('on', !!isOn);
}
/**
 * Dynamically populates the provider select menu based on SUPPORTED_PROVIDERS
 */
function populateProviderSelect(providers, apiKeys = {}) {
    const select = document.getElementById('defaultProviderSelect');
    if (!select) return;
    
    // Map provider names to their API key identifiers in settings
    const keyMap = { claude: 'anthropic' };

    const currentSelection = select.value;
    select.innerHTML = providers.map(p => {
        const keyName = keyMap[p] || p;
        const hasKey = !!apiKeys[keyName] || p === 'ollama'; 
        const label = p.charAt(0).toUpperCase() + p.slice(1);
        const indicator = hasKey ? '●' : '○';
        
        return `<option value="${p}">${label} ${indicator}</option>`;
    }).join('');
    
    if (currentSelection) select.value = currentSelection;
}

/**
 * Updates the tooltip (title attribute) of the provider select to show model info
 */
function updateModelTooltip() {
    const select = document.getElementById('defaultProviderSelect');
    if (!select || !CACHED_MODELS) return;
    
    const provider = select.value;
    const info = CACHED_MODELS[provider];
    
    if (info) {
        const m = info.metadata || {};
        const f = info.fast;
        const s = info.smart;
        
        const fDetail = m[f] ? ` (${m[f].limit}, ${m[f].price})` : "";
        const sDetail = m[s] ? ` (${m[s].limit}, ${m[s].price})` : "";

        select.title = `Fast: ${f}${fDetail}\nSmart: ${s}${sDetail}`;
    } else {
        select.title = 'Select an AI provider';
    }
}
function updateModelOptions() {
    const agentSelect = document.getElementById('agentSelect');
    const modelSelect = document.getElementById('modelTypeSelect');
    if (!modelSelect || !CACHED_MODELS)
        return;
    const agentName = agentSelect?.value || 'auto';
    const provider = getProviderForAgent(agentName, window.appData.settings?.ai?.defaultProvider || 'gemini');
    const info = CACHED_MODELS[provider] || CACHED_MODELS.openai || {};
    const currentVal = modelSelect.value;
    modelSelect.innerHTML = `
        <option value="fast" ${currentVal === 'fast' ? 'selected' : ''}>${info.fast || 'Fast Model'}</option>
        <option value="smart" ${currentVal === 'smart' ? 'selected' : ''}>${info.smart || 'Smart Model'}</option>
        <option value="latest" ${currentVal === 'latest' ? 'selected' : ''}>${info.latest || 'Latest Model'}</option>
    `;
}

async function applySettingsToUI(settings) {
    if (!settings || typeof settings !== 'object')
        return;

    // Fetch dynamic list from Main process with strict function check
    try {
        const models = (window.electronAPI && typeof window.electronAPI.getModels === 'function') 
            ? await window.electronAPI.getModels() 
            : await createBrowserFallbackApi().getModels();
        
        if (models && Object.keys(models).length > 0) {
            CACHED_MODELS = models;
        }
    } catch (e) {
        console.error("Failed to fetch models, using default mapping", e);
        CACHED_MODELS = await createBrowserFallbackApi().getModels();
    }

    // Ensure providers list is not empty for selection UI
    if (Object.keys(CACHED_MODELS).length === 0) {
        CACHED_MODELS = await createBrowserFallbackApi().getModels();
    }

    const providers = Object.keys(CACHED_MODELS);
    const apiKeys = settings.apiKeys || {};
    populateProviderSelect(providers, apiKeys);

    const ai = settings.ai || {};
    const ui = settings.ui || {};
    const endpoints = settings.endpoints || {};
    const privacy = settings.privacy || {};
    setInputValue('defaultProviderSelect', ai.defaultProvider);
    setInputValue('aiTemperature', ai.temperature);
    setInputValue('maxTokens', ai.maxTokens);
    setInputValue('systemPromptText', ai.systemPrompt || settings.systemPrompt || '');
    setInputValue('themeSelect', ui.theme);
    setInputValue('displayName', ui.displayName);
    setToggleState('autoscroll', ui.autoScroll);
    setToggleState('compact', ui.compact);
    // Ensure privacy settings are loaded and applied
    setInputValue('logRetentionSelect', privacy.logRetention || '30');
    setToggleState('clearOnExit', privacy.clearOnExit);
    setToggleState('incognito', privacy.incognito);
    uiController.updateIncognitoIndicator(privacy.incognito);
    setInputValue('anthropicKey', apiKeys.anthropic);
    setInputValue('geminiKey', apiKeys.gemini);
    setInputValue('openaiKey', apiKeys.openai);
    setInputValue('deepseekKey', apiKeys.deepseek);
    setInputValue('aipipeKey', apiKeys.aipipe);
    setInputValue('customBaseUrl', endpoints.openaiCompatibleBaseUrl);
    setInputValue('ollamaBaseUrl', endpoints.ollamaBaseUrl);
    applyTopbarState(settings.topbar || {});
    renderKeysPanel(settings);
    updateModelTooltip();
    const tempVal = document.getElementById('tempVal');
    const tempInput = document.getElementById('aiTemperature');
    if (tempVal && tempInput) {
        tempVal.textContent = tempInput.value || '0.7';
    }
    if (ui.theme) {
        document.documentElement.setAttribute('data-theme', ui.theme);
    }
}
function parseEnvText(text) {
    const env = {};
    String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .forEach(line => {
        const idx = line.indexOf('=');
        if (idx <= 0)
            return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key)
            env[key] = value;
    });
    return env;
}
function renderMcpLists(config, statuses) {
    const servers = config?.mcpServers || {};
    const listItems = Object.entries(servers);
    const settingsList = document.getElementById('mcpSettingsList');
    const panelList = document.getElementById('panelMcpList');
    const html = listItems.length
        ? listItems.map(([name, server]) => {
            const status = String(statuses?.[name]?.status || 'off').toLowerCase();
            const args = Array.isArray(server?.args) ? server.args.join(' ') : '';
            const statusText = status === 'running' ? 'RUNNING' : status.toUpperCase();
            const statusClass = status === 'running' ? 'connected'
                : status === 'starting' ? 'checking'
                    : 'offline';
            const encodedName = encodeURIComponent(name);
            return `
        <div class="memory-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div class="memory-label">${escapeHtml(name)} (${statusText})</div>
            <button class="btn btn-danger btn-sm" title="Delete MCP server" data-onclick="deleteMcpServer('${encodedName}')">🗑</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="connection-badge ${statusClass}">${statusText}</span>
            <span>${escapeHtml(server?.command || '')} ${escapeHtml(args)}</span>
          </div>
        </div>
      `;
        }).join('')
        : `<div class="memory-item"><div class="memory-label">No MCP servers configured</div><div>Add one from settings.</div></div>`;
    if (settingsList)
        settingsList.innerHTML = html;
    if (panelList)
        panelList.innerHTML = html;
}
async function loadMcpConfigIntoUI() {
    if (!window.electronAPI?.getMcpConfig)
        return;
    try {
        const [config, statuses] = await Promise.all([
            window.electronAPI.getMcpConfig(),
            window.electronAPI.getMcpStatuses ? window.electronAPI.getMcpStatuses() : Promise.resolve({})
        ]);
        renderMcpLists(config || { mcpServers: {} }, statuses || {});
    }
    catch (err) {
        console.error('Failed to load MCP config:', err);
    }
}
// Initialize Global State
window.state = {
    currentChatId: null,
    messages: [],
    user: null,
    sessionData: []
};
window.appData = {
    chatHistory: [],
    settings: {}
};
window.streamState = {
    isGenerating: false,
    currentMessageId: null
};
// Application Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
    console.log('NeuralDesk Core Initialized');
    if (IS_BROWSER_FALLBACK) {
        showBrowserModeBanner();
    }
    bindDataDrivenHandlers();
    // Load initial data from backend first
    try {
        const history = await window.electronAPI.getData('chatHistory');
        if (history)
            window.appData.chatHistory = history;
        const settings = await window.electronAPI.getSettings();
        if (settings)
            window.appData.settings = settings;
        await applySettingsToUI(window.appData.settings);
        await loadMcpConfigIntoUI();
        // Initial Render
        updateUIFromState();
        updateModelOptions();
        window.checkConnection();
        // Auto-load most recent chat if available
        if (window.appData.chatHistory.length > 0) {
            window.loadChat(window.appData.chatHistory[0].id);
        }
        // Initialize Chat Components
        chatController.renderOptionsBar(document.getElementById('chatOptionsBar'));
        chatController.renderDefaultPrompts(document.getElementById('welcomePromptLibrary'));
    }
    catch (err) {
        console.error('Failed to initialize app data:', err);
    }
    // Auth Check
    const savedUser = localStorage.getItem('nd_user');
    if (savedUser) {
        window.state.user = JSON.parse(savedUser);
        authController.hide();
        const nameEl = document.getElementById('sidebarName');
        if (nameEl)
            nameEl.textContent = window.state.user?.username || 'Guest';
    }
    else {
        // If no user, we show auth but don't block the UI behind it
        authController.show();
    }
    // Listen for AI provider fallback events
    window.electronAPI.onToolEvent((data) => {
        if (data.type === 'fallback') {
            uiController.showToast(data.message, 'warning');
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.placeholder = data.message;
            }
        }
    });
});
function updateUIFromState() {
    const nameEl = document.getElementById('sidebarName');
    if (nameEl)
        nameEl.textContent = window.state.user?.username || 'Guest';
    // Render history
    renderHistory();
}
function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list)
        return;
    if (!window.appData.chatHistory || window.appData.chatHistory.length === 0) {
        list.innerHTML = '<div class="history-empty">No conversations yet</div>';
        return;
    }
    list.innerHTML = window.appData.chatHistory.map(chat => `
    <div class="history-item ${chat.id === window.state.currentChatId ? 'active' : ''}" 
         data-onclick="window.loadChat('${chat.id}')">
      <span class="h-icon">💬</span>
      <div class="history-text">${chat.title}</div>
      <div class="history-time">${new Date(chat.timestamp).toLocaleDateString()}</div>
      <button class="history-delete-btn" title="Delete Chat" 
              data-onclick="window.deleteChat('${chat.id}', event)">
        ×
      </button>
    </div>
  `).join('');
}
// Global scope attachments for HTML onclicks (Legacy compatibility)
window.toolUI = toolUI;
window.refreshSettingsPanels = () => {
    renderKeysPanel(window.appData.settings || {});
    applyTopbarState(window.appData.settings?.topbar || {});
    uiController.updateIncognitoIndicator(window.appData.settings?.privacy?.incognito);
};
window.switchView = (view, el) => router.switchView(view, el);
window.sendMessage = () => {
    chatController.sendMessage(collectActiveTools());
};
window.login = window.handleLogin = async () => {
    const res = await authController.login();
    if (res?.ok && res.user) {
        window.state.user = res.user;
        localStorage.setItem('nd_user', JSON.stringify(res.user));
        authController.hide();
        updateUIFromState();
    }
};
window.signup = window.handleSignup = async () => {
    const res = await authController.signup();
    if (res?.ok && res.user) {
        window.state.user = res.user;
        localStorage.setItem('nd_user', JSON.stringify(res.user));
        authController.hide();
        updateUIFromState();
    }
};
window.logout = window.handleLogout = () => authController.logout();
window.continueAsGuest = () => {
    window.state.user = { username: 'Guest' };
    localStorage.setItem('nd_user', JSON.stringify(window.state.user));
    authController.hide();
    const nameEl = document.getElementById('sidebarName');
    if (nameEl)
        nameEl.textContent = 'Guest';
};
window.openSettings = (pane) => uiController.openSettings(pane);
window.closeSettings = () => uiController.closeSettings();
window.switchSettingsPane = (pane, el) => uiController.switchSettingsPane(pane, el);
window.showToast = (msg, type) => uiController.showToast(msg, type);
window.renderHistory = renderHistory;
window.autoResize = (el) => uiController.autoResize(el);
window.renderer = {
    render: (content, container) => uiController.renderMarkdown(content ?? '', container)
};
window.toggleAuthView = () => {
    const loginView = document.getElementById('loginView');
    const signupView = document.getElementById('signupView');
    if (loginView && signupView) {
        const isLogin = loginView.style.display !== 'none';
        loginView.style.display = isLogin ? 'none' : 'block';
        signupView.style.display = isLogin ? 'block' : 'none';
    }
};
window.newChat = () => {
    chatController.resetComposerState();
    window.state.currentChatId = null;
    window.state.messages = [];
    const container = document.getElementById('chatMessages');
    if (container) {
        container.innerHTML = `
            <div class="welcome-screen" id="welcomeScreen">
                <div class="welcome-glyph">🧠</div>
                <div>
                    <div class="welcome-title">What shall we<br><em>build together</em>?</div>
                    <div class="welcome-sub mt-1">Multi-model AI desktop with agents, MCP, and integrations</div>
                </div>
                <div class="welcome-actions-container">
                    <div class="welcome-section-header">
                        <span class="welcome-section-label">Prompt Library</span>
                    </div>
                    <div id="welcomePromptLibrary"></div>
                </div>
                <div class="welcome-section-header mt-4">
                    <span class="welcome-section-label">Quick Actions</span>
                </div>
                <div id="quickActions" class="quick-actions"></div>
            </div>
        `;
        // Re-render prompt library
        chatController.renderDefaultPrompts(document.getElementById('welcomePromptLibrary'));
        
        // Re-populate quick actions (or just leave them static in HTML if they are static)
        // For now I'll just restore the static ones if they were there
        const qaContainer = document.getElementById('quickActions');
        if (qaContainer) {
            qaContainer.innerHTML = `
                <div class="quick-action" onclick="quickPrompt('Write a Python FastAPI server with JWT auth and PostgreSQL')">
                    <div class="qa-icon">⚡</div>
                    <div class="qa-title">Build an API</div>
                    <div class="qa-sub">FastAPI, Express, or Hono with auth</div>
                </div>
                <div class="quick-action" onclick="quickPrompt('Analyze this data and give me insights with visualizations')">
                    <div class="qa-icon">📊</div>
                    <div class="qa-title">Analyze Data</div>
                    <div class="qa-sub">Upload CSV, JSON, or describe dataset</div>
                </div>
                <div class="quick-action" onclick="quickPrompt('Create a multi-agent workflow that can search the web and summarize findings')">
                    <div class="qa-icon">🤖</div>
                    <div class="qa-title">Run an Agent</div>
                    <div class="qa-sub">Web search, code exec, file ops</div>
                </div>
                <div class="quick-action" onclick="quickPrompt('Help me debug this error and explain the root cause')">
                    <div class="qa-icon">🔧</div>
                    <div class="qa-title">Debug & Explain</div>
                    <div class="qa-sub">Paste code or describe the issue</div>
                </div>
            `;
        }
    }
    const input = document.getElementById('chatInput');
    if (input) {
        input.disabled = false;
        input.readOnly = false;
        input.removeAttribute('disabled');
        input.removeAttribute('readonly');
        input.style.pointerEvents = 'auto';
        input.focus();
    }
    renderHistory();
};
window.loadChat = (id) => {
    const chat = window.appData.chatHistory.find(c => c.id === id);
    if (chat) {
        window.state.currentChatId = id;
        window.state.messages = [...chat.messages];
        
        const container = document.getElementById('chatMessages');
        if (container) {
            container.innerHTML = '';
            // Optimization: Create messages without scrolling or highlighting each time
            chat.messages.forEach(m => {
                chatController.addMessage(m.role, m.content ?? '', { skipScroll: true, skipHighlight: true });
            });
            
            // Final scroll and highlight pass
            container.scrollTop = container.scrollHeight;
            if (window.Prism) window.Prism.highlightAllUnder(container);
        }
        renderHistory();
    }
};
window.clearChatHistory = async () => {
    const chatId = window.state.currentChatId;
    if (!chatId) return;
    if (!confirm('Are you sure you want to clear the memory for this conversation? This cannot be undone.')) return;

    try {
        const res = await window.electronAPI.clearChatHistory(chatId);
        if (res.ok) {
            // Clear local state
            window.state.messages = [];
            const chat = window.appData.chatHistory.find(c => c.id === chatId);
            if (chat) chat.messages = [];
            
            // Clear memory session in main process
            await window.electronAPI.clearSession(chatId);

            // Refresh UI
            const container = document.getElementById('chatMessages');
            if (container) container.innerHTML = '';
            window.loadChat(chatId); // Reload the now-empty chat
            
            uiController.showToast('Conversation memory cleared', 'success');
        } else {
            uiController.showToast('Failed to clear memory: ' + res.error, 'error');
        }
    } catch (err) {
        console.error('Clear History Error:', err);
    }
};
window.deleteChat = async (chatId, event) => {
    if (event)
        event.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?'))
        return;
    try {
        const res = await window.electronAPI.deleteChat(chatId);
        if (res.ok) {
            window.appData.chatHistory = window.appData.chatHistory.filter(c => c.id !== chatId);
            if (window.state.currentChatId === chatId) {
                chatController.resetComposerState();
                window.newChat();
            }
            renderHistory();
            uiController.showToast('Chat deleted', 'success');
        }
        else {
            uiController.showToast('Delete failed: ' + res.error, 'error');
        }
    }
    catch (err) {
        console.error(err);
        uiController.showToast('Error deleting chat', 'error');
    }
};
window.quickPrompt = (text) => {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = text;
        uiController.autoResize(input);
        chatController.sendMessage();
    }
};
window.saveSettings = () => {
    const providerSelect = document.getElementById('defaultProviderSelect');
    if (providerSelect && !Object.keys(CACHED_MODELS).includes(providerSelect.value)) {
        uiController.showToast(`Selected provider "${providerSelect.value}" is not supported.`, 'error');
        return;
    }

    settingsController.saveSettings();
};
window.toggleSetting = (id) => settingsController.toggleSetting(id);
window.updateModelTooltip = () => updateModelTooltip();
window.onAgentChange = () => {
    updateModelOptions();
    window.checkConnection();
};
window.toggleKeyVisibility = (id) => settingsController.toggleKeyVisibility(id);
window.toggleTool = (btnId, toolValue) => {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.toggle('active');
        const isActive = btn.classList.contains('active');
        if (toolValue) btn.setAttribute('data-tool', toolValue);
        const toolName = btn.getAttribute('data-tool') || btn.textContent?.trim();
        
        // 1. Update Input Area Chips
        const container = document.getElementById('activeTools');
        if (container) {
            if (isActive) {
                if (!document.getElementById(`chip-${btnId}`)) {
                    const chip = document.createElement('div');
                    chip.className = 'tool-chip';
                    chip.id = `chip-${btnId}`;
                    chip.innerHTML = `
                        <span>${toolName}</span>
                        <span class="remove-tool" onclick="event.stopPropagation(); window.toggleTool('${btnId}')">×</span>
                    `;
                    container.appendChild(chip);
                }
            } else {
                const chip = document.getElementById(`chip-${btnId}`);
                if (chip) chip.remove();
            }
        }

        // 2. Update Side Panel Active Tools List
        const sideList = document.getElementById('activeToolsList');
        if (sideList) {
            if (isActive) {
                if (!document.getElementById(`side-chip-${btnId}`)) {
                    const sideChip = document.createElement('div');
                    sideChip.className = 'tool-chip';
                    sideChip.id = `side-chip-${btnId}`;
                    sideChip.innerHTML = `
                        <span>${toolName}</span>
                        <span class="remove-tool" onclick="event.stopPropagation(); window.toggleTool('${btnId}')">×</span>
                    `;
                    sideList.appendChild(sideChip);
                }
            } else {
                const sideChip = document.getElementById(`side-chip-${btnId}`);
                if (sideChip) sideChip.remove();
            }
        }
        
        uiController.showToast(`${toolName} ${isActive ? 'Enabled' : 'Disabled'}`, isActive ? 'success' : 'info');
    }
};
window.checkConnection = async () => {
    await uiController.checkConnection();
    try {
        await persistTopbarState();
    }
    catch (err) {
        console.error('Failed to persist topbar state:', err);
    }
};
window.toggleRightPanel = () => uiController.toggleRightPanel();
window.switchPanelTab = (tabId, el) => uiController.switchPanelTab(tabId, el);
window.closeOnOutside = (event, modalId, closeFn) => uiController.closeOnOutside(event, modalId, closeFn);
window.setArtifactView = (v) => uiController.setArtifactView(v);
window.closeArtifact = () => uiController.closeArtifact();
window.handleKey = (e) => uiController.handleKey(e, () => chatController.sendMessage());
window.cancelGeneration = () => {
    window.streamState.isGenerating = false;
    uiController.showToast('Generation cancelled', 'info');
};
const notReady = (feature) => uiController.showToast(`${feature} is not available yet`, 'info');
window.addNewTab = () => notReady('Tab creation');
window.selectTab = (el) => {
    document.querySelectorAll('.agent-tab').forEach(tab => tab.classList.remove('active'));
    el?.classList.add('active');
};
window.attachFile = () => notReady('File attachment');
window.voiceInput = () => notReady('Voice input');
window.copyMessage = () => notReady('Copy action');
window.regenMessage = window.retryMessage = () => chatController.retryLastMessage();
window.editMessage = () => notReady('Message editing');
window.deleteMessage = () => notReady('Delete action');
window.runAgentFlow = () => notReady('Agent flow builder');
window.addNode = () => notReady('Node builder');
window.openMcpConfigFile = async () => {
    if (!window.electronAPI?.openMcpConfigFile) {
        notReady('Open MCP config file');
        return;
    }
    const result = await window.electronAPI.openMcpConfigFile();
    if (!result?.ok) {
        uiController.showToast(`Unable to open config: ${result?.error || 'unknown error'}`, 'error');
    }
};
window.addMcpServerFromForm = async () => {
    if (!window.electronAPI?.getMcpConfig || !window.electronAPI?.saveMcpConfig) {
        notReady('Add MCP server');
        return;
    }
    const name = document.getElementById('mcpServerName')?.value?.trim();
    const command = document.getElementById('mcpServerCommand')?.value?.trim();
    const argsRaw = document.getElementById('mcpServerArgs')?.value || '';
    const envRaw = document.getElementById('mcpServerEnv')?.value || '';
    if (!name || !command) {
        uiController.showToast('Server name and command are required', 'error');
        return;
    }
    const config = (await window.electronAPI.getMcpConfig()) || { mcpServers: {} };
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[name] = {
        command,
        args: argsRaw.split(',').map(v => v.trim()).filter(Boolean),
        env: parseEnvText(envRaw)
    };
    const saved = await window.electronAPI.saveMcpConfig(config);
    if (!saved?.ok) {
        uiController.showToast(`Failed to save MCP server: ${saved?.error || 'unknown error'}`, 'error');
        return;
    }
    uiController.showToast('MCP server saved', 'success');
    await loadMcpConfigIntoUI();
};
window.deleteMcpServer = async (encodedName) => {
    const name = decodeURIComponent(String(encodedName || ''));
    if (!name)
        return;
    if (!window.electronAPI?.getMcpConfig || !window.electronAPI?.saveMcpConfig) {
        notReady('Delete MCP server');
        return;
    }
    const config = (await window.electronAPI.getMcpConfig()) || { mcpServers: {} };
    config.mcpServers = config.mcpServers || {};
    if (!config.mcpServers[name]) {
        uiController.showToast(`MCP server not found: ${name}`, 'error');
        return;
    }
    delete config.mcpServers[name];
    const saved = await window.electronAPI.saveMcpConfig(config);
    if (!saved?.ok) {
        uiController.showToast(`Failed to delete MCP server: ${saved?.error || 'unknown error'}`, 'error');
        return;
    }
    uiController.showToast(`Deleted MCP server: ${name}`, 'success');
    await loadMcpConfigIntoUI();
};
