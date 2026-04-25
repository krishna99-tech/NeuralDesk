/**
 * NeuralDesk UI & Navigation
 * Handles view switching, list rendering, and modal management.
 */

const TOOL_BUTTON_MAP = {
  webSearchBtn: 'web_search',
  codeExecBtn: 'run_code',
  fileReadBtn: 'files',
  memoryToolBtn: 'memory',
  mcpToolBtn: 'mcp'
};

const TOOL_LABEL_MAP = {
  web_search: 'Web Search',
  run_code: 'Run Code',
  files: 'Files',
  memory: 'Memory',
  mcp: 'MCP'
};

/**
 * Switch between main application views (Chat, Agents, Analytics)
 */
function switchView(view, el) {
  window.state.currentView = view;
  
  // UI Updates
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  
  // Panel Visibility
  document.getElementById('chatPanel').style.display = view === 'chat' ? 'flex' : 'none';
  const ab = document.getElementById('agentBuilderPanel');
  const vz = document.getElementById('vizPanel');
  if (ab) ab.classList.toggle('visible', view === 'agents');
  if (vz) vz.classList.toggle('visible', view === 'viz');
  
  // Data Refresh
  if (view === 'viz') renderAnalytics();
  
  // Sidebar/Panel logic
  const rightPanel = document.getElementById('rightPanel');
  if (view === 'agents') rightPanel.classList.add('collapsed');
  else if (window.state.rightPanelOpen) rightPanel.classList.remove('collapsed');
}

/**
 * Settings Modal Management
 */
function openSettings(pane = 'general') {
  const modal = document.getElementById('settingsModal');
  modal.classList.add('open');
  switchSettingsPane(pane, document.querySelector(`[data-pane="${pane}"]`) || document.querySelector('.msidebar-item'));
  if (pane === 'mcp') loadMcpServers();
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}

async function saveSettings() {
  if (!window.state.runtimeSettings) return;

  const getValue = (id) => document.getElementById(id)?.value || '';
  
  const updatedSettings = {
    ...window.state.runtimeSettings,
    profile: { displayName: getValue('displayName') || 'Guest' },
    systemPrompt: getValue('systemPromptText'),
    apiKeys: {
      anthropic: getValue('anthropicKey'),
      gemini: getValue('geminiKey'),
      openai: getValue('openaiKey'),
      groq: getValue('groqKey'),
      mistral: getValue('mistralKey'),
      cohere: getValue('cohereKey')
    },
    external: {
      github: getValue('githubToken'),
      notion: getValue('notionKey'),
      discord: getValue('discordWebhook')
    },
    endpoints: {
      openaiCompatibleBaseUrl: getValue('customBaseUrl'),
      ollamaBaseUrl: getValue('ollamaBaseUrl')
    }
  };

  const saved = await window.db.saveSettings(updatedSettings);
  window.state.runtimeSettings = saved;
  showToast('Global settings synchronized', 'success');
  onModelChange();
}

/**
 * List Rendering Functions
 */

function renderRecentChats() {
  const container = document.getElementById('historyList');
  if (!container || !window.appData.chatHistory) return;
  if (window.appData.chatHistory.length === 0) {
    container.innerHTML = '<div class="history-empty">No chats yet</div>';
    return;
  }

  const now = new Date();
  const groups = { 'Today': [], 'Yesterday': [], 'Recent': [] };

  window.appData.chatHistory.forEach(chat => {
    const date = new Date(chat.timestamp);
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) groups['Today'].push(chat);
    else if (diffDays === 1) groups['Yesterday'].push(chat);
    else groups['Recent'].push(chat);
  });

  let html = '';
  for (const [label, chats] of Object.entries(groups)) {
    if (chats.length === 0) continue;
    html += `<div class="history-group-label">${label}</div>`;
    chats.forEach(chat => {
      const active = chat.id === window.state.currentChatId ? 'active' : '';
      html += `
        <div class="history-item ${active}" onclick="loadChatById('${chat.id}')">
                    <span class="h-icon">></span>
          <span class="history-text">${chat.title}</span>
          <button
            type="button"
            class="history-delete-btn"
            title="Delete chat"
            onclick="event.stopPropagation(); deleteChatById('${chat.id}')"
                    >x</button>
        </div>`;
    });
  }
  container.innerHTML = html;
}

async function renderAnalytics() {
  const container = document.getElementById('tokenChart');
  if (!container) return;

  const logs = await window.api.getData();
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm">No activity recorded.</div>';
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="stat-item" style="text-align:left; padding:12px; margin-bottom:8px;">
      <div class="text-xs text-accent font-mono">${new Date(log.created_at).toLocaleString()}</div>
      <div class="text-sm font-bold mt-1">Prompt: ${log.input.substring(0, 60)}...</div>
      <div class="text-xs text-muted mt-1">Agent: ${log.agent}</div>
    </div>
  `).join('');
}

async function renderMemory() {
  const container = document.querySelector('#panelMemory .ps-body');
  if (!container) return;
  
  const memories = await window.db.find('memory');
  if (!memories || memories.length === 0) {
    container.innerHTML = '<div class="text-muted text-xs">No long-term memories found.</div>';
    return;
  }

  container.innerHTML = memories.map(m => `
    <div class="memory-item">
      <div class="memory-label">${m.label}</div>
      <div class="text-xs">${m.text}</div>
    </div>
  `).join('');
}

async function renderKeys() {
  const container = document.getElementById('panelKeysList');
  if (!container) return;

  const settings = await window.db.getSettings();
  const keys = settings?.apiKeys || {};
  
  const providers = [
    { id: 'openai', name: 'OpenAI', icon: '🟢' },
    { id: 'anthropic', name: 'Anthropic', icon: '🟣' },
    { id: 'gemini', name: 'Google AI', icon: '🔵' }
  ];

  container.innerHTML = providers.map(p => {
    const key = keys[p.id];
    return `
      <div class="integration-card" onclick="openSettings('integrations')">
        <div class="int-icon">${p.icon}</div>
        <div>
          <div class="int-name">${p.name}</div>
          <div class="int-key">${key ? '••••' + key.slice(-4) : 'Not configured'}</div>
        </div>
        <span class="int-badge ${key ? 'connected' : 'config'}">${key ? 'Active' : 'Setup'}</span>
      </div>`;
  }).join('');
}

function getSelectedTools() {
  return Object.entries(TOOL_BUTTON_MAP)
    .filter(([buttonId]) => document.getElementById(buttonId)?.classList.contains('active-tool'))
    .map(([, toolKey]) => toolKey);
}

function renderActiveTools() {
  const container = document.getElementById('activeToolsList');
  if (!container) return;
  const tools = getSelectedTools();
  if (tools.length === 0) {
    container.innerHTML = '<span class="text-xs text-muted">No tools selected</span>';
    return;
  }
  container.innerHTML = tools.map((tool) => (
    `<span class="chip chip-purple">${escapeHtml(TOOL_LABEL_MAP[tool] || tool)}</span>`
  )).join('');
}

function toggleTool(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.classList.toggle('active-tool');
  renderActiveTools();
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadMcpServers() {
  try {
    await window.electronAPI.startMcpServers();
    const [config, statuses] = await Promise.all([
      window.electronAPI.getMcpConfig(),
      window.electronAPI.getMcpStatuses()
    ]);
    const servers = config?.mcpServers || {};
    window.appData.mcps.settings = Object.entries(servers).map(([name, cfg]) => ({
      name,
      command: cfg?.command || '',
      args: Array.isArray(cfg?.args) ? cfg.args : [],
      env: cfg?.env && typeof cfg.env === 'object' ? cfg.env : {},
      status: statuses?.[name]?.status || 'off',
      lastError: statuses?.[name]?.lastError || '',
      startupLogPath: statuses?.[name]?.startupLogPath || ''
    }));
    renderMcpServers();
  } catch (error) {
    console.error('Failed to load MCP config:', error);
    showToast(`MCP load failed: ${error.message}`, 'error');
  }
}

function renderMcpServers() {
  const panel = document.getElementById('panelMcpList');
  const settingsList = document.getElementById('mcpSettingsList');
  const rows = Array.isArray(window.appData.mcps.settings) ? window.appData.mcps.settings : [];

  if (rows.length === 0) {
    const empty = '<div class="text-muted text-xs" style="padding:10px 0">No MCP servers configured yet.</div>';
    if (panel) panel.innerHTML = empty;
    if (settingsList) settingsList.innerHTML = empty;
    return;
  }

  if (panel) {
    panel.innerHTML = rows.map(s => `
      <div class="mcp-card">
        <div class="mcp-icon">M</div>
        <div class="mcp-info">
          <div class="mcp-name">${escapeHtml(s.name)}</div>
          <div class="mcp-desc">${escapeHtml(s.command)} ${escapeHtml((s.args || []).join(' '))}</div>
          <div class="mcp-desc">status: ${escapeHtml(s.status || 'off')}${s.lastError ? ` | ${escapeHtml(s.lastError)}` : ''}</div>
          ${s.startupLogPath ? `<div class="mcp-desc">startup log: ${escapeHtml(s.startupLogPath)}</div>` : ''}
        </div>
        <div class="mcp-status-dot ${s.status === 'running' ? 'on' : (s.status === 'starting' ? 'warn' : 'off')}"></div>
      </div>
    `).join('');
  }

  if (settingsList) {
    settingsList.innerHTML = rows.map(s => `
      <div class="mcp-card">
        <div class="mcp-icon">M</div>
        <div class="mcp-info">
          <div class="mcp-name">${escapeHtml(s.name)}</div>
          <div class="mcp-desc">${escapeHtml(s.command)} ${escapeHtml((s.args || []).join(' '))}</div>
          <div class="mcp-desc">status: ${escapeHtml(s.status || 'off')}${s.lastError ? ` | ${escapeHtml(s.lastError)}` : ''}</div>
          ${s.startupLogPath ? `<div class="mcp-desc">startup log: ${escapeHtml(s.startupLogPath)}</div>` : ''}
        </div>
        <button class="btn btn-danger btn-sm" onclick='removeMcpServer(${JSON.stringify(s.name)})'>Remove</button>
      </div>
    `).join('');
  }
}

function parseMcpEnv(raw) {
  const source = String(raw || '').trim();
  if (!source) return {};

  // Accept full JSON object payload as well.
  if (source.startsWith('{') && source.endsWith('}')) {
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const envFromJson = {};
        for (const [k, v] of Object.entries(parsed)) {
          const key = String(k || '').trim();
          if (!key) continue;
          envFromJson[key] = String(v ?? '');
        }
        return envFromJson;
      }
    } catch {
      // Fall through to line parsing.
    }
  }

  const env = {};
  const lines = source.split(/\r?\n/).map(v => v.trim()).filter(Boolean);

  const stripWrappers = (v) => {
    let out = String(v || '').trim();
    out = out.replace(/,$/, '').trim();
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
      out = out.slice(1, -1).trim();
    }
    return out;
  };

  for (const line of lines) {
    let idx = line.indexOf('=');
    let delimiter = '=';
    if (idx <= 0) {
      idx = line.indexOf(':');
      delimiter = ':';
    }
    if (idx <= 0) continue;

    const k = stripWrappers(line.slice(0, idx));
    let v = stripWrappers(line.slice(idx + 1));
    if (delimiter === ':' && v.endsWith(',')) v = v.slice(0, -1).trim();
    if (!k) continue;
    env[k] = v;
  }
  return env;
}

async function addMcpServerFromForm() {
  const name = document.getElementById('mcpServerName')?.value.trim() || '';
  const command = document.getElementById('mcpServerCommand')?.value.trim() || '';
  const rawArgs = document.getElementById('mcpServerArgs')?.value || '';
  const rawEnv = document.getElementById('mcpServerEnv')?.value || '';

  if (!name) return showToast('MCP server name is required', 'error');
  if (!command) return showToast('MCP command is required', 'error');

  const args = rawArgs.split(',').map(v => v.trim()).filter(Boolean);
  const env = parseMcpEnv(rawEnv);
  if (rawEnv.trim() && Object.keys(env).length === 0) {
    return showToast('Invalid env format. Use KEY=VALUE or JSON object format.', 'error');
  }

  try {
    await window.electronAPI.addMcpServer({ name, command, args, env });
    showToast(`MCP server '${name}' added`, 'success');
    const reset = (id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    };
    reset('mcpServerName');
    reset('mcpServerCommand');
    reset('mcpServerArgs');
    reset('mcpServerEnv');
    await loadMcpServers();
  } catch (error) {
    console.error('Failed to add MCP server:', error);
    showToast(`Add MCP failed: ${error.message}`, 'error');
  }
}

async function removeMcpServer(name) {
  const confirmed = window.confirm(`Remove MCP server '${name}'?`);
  if (!confirmed) return;
  try {
    await window.electronAPI.removeMcpServer(name);
    showToast(`Removed '${name}'`, 'success');
    await loadMcpServers();
  } catch (error) {
    console.error('Failed to remove MCP server:', error);
    showToast(`Remove MCP failed: ${error.message}`, 'error');
  }
}

async function openMcpConfigFile() {
  try {
    await window.electronAPI.openMCPConfig();
  } catch (error) {
    console.error('Failed to open MCP config:', error);
    showToast(`Open config failed: ${error.message}`, 'error');
  }
}

/**
 * UI Utilities
 */
function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  // Find the 'Show/Hide' toggle label next to the input
  const toggle = input.nextElementSibling;
  
  if (input.type === 'password') {
    input.type = 'text';
    if (toggle) toggle.textContent = 'Hide';
  } else {
    input.type = 'password';
    if (toggle) toggle.textContent = 'Show';
  }
}

function toggleRightPanel() {
  window.state.rightPanelOpen = !window.state.rightPanelOpen;
  document.getElementById('rightPanel').classList.toggle('collapsed', !window.state.rightPanelOpen);
  document.getElementById('panelToggleBtn').classList.toggle('active', window.state.rightPanelOpen);
}

function switchSettingsPane(pane, el) {
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.msidebar-item').forEach(i => i.classList.remove('active'));
  const target = document.getElementById(`pane-${pane}`);
  if (target) target.classList.remove('hidden');
  if (el) el.classList.add('active');
}

function switchPanelTab(tab, el) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['mcp','agent','memory','keys'].forEach(t => {
    const p = document.getElementById(`panel${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (p) p.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'mcp') renderActiveTools();
}

async function checkConnection() {
  const badge = document.getElementById('connectionBadge');
  if (!badge) return;

  const agent = document.getElementById('agentSelect')?.value || 'auto';
  const settings = window.state.runtimeSettings;
  const keys = settings?.apiKeys || {};

  badge.textContent = 'Checking...';
  badge.className = 'connection-badge checking';

  // Mapping agent names to provider keys
  const providerMap = {
    auto: 'gemini', // Auto defaults to gemini
    analyzer: 'gemini',
    reasoner: 'anthropic',
    geminiAgent: 'gemini',
    local: 'ollama'
  };

  const provider = providerMap[agent];
  const key = keys[provider];

  // Simulated check with actual key validation
  setTimeout(() => {
    if (provider === 'ollama') {
      badge.textContent = 'Local (Ollama)';
      badge.className = 'connection-badge ok';
    } else if (key && key.length > 10) {
      badge.textContent = 'Connected';
      badge.className = 'connection-badge ok';
    } else {
      badge.textContent = 'Missing Key';
      badge.className = 'connection-badge err';
    }
  }, 400);
}

