export class UIController {
    settingsModal = null;
    toastContainer = null;
    constructor() {
        this.toastContainer = document.getElementById('toastContainer');
        // Explicitly bind methods to ensure they are available as functions
        this.switchPanelTab = this.switchPanelTab.bind(this);
        this.switchSettingsPane = this.switchSettingsPane.bind(this);
        this.closeOnOutside = this.closeOnOutside.bind(this);
    }
    openSettings(pane = 'general') {
        if (!this.settingsModal) {
            this.settingsModal = document.getElementById('settingsModal');
        }
        if (this.settingsModal) {
            this.settingsModal.classList.add('open');
            this.switchSettingsPane(pane);
        } else {
            console.error('Settings modal not found in DOM');
        }
    }
    closeSettings() {
        if (this.settingsModal)
            this.settingsModal.classList.remove('open');
    }
    switchSettingsPane(paneId, el) {
        // Update sidebar active state
        const items = document.querySelectorAll('.msidebar-item');
        items.forEach(item => item.classList.remove('active'));
        if (el) {
            el.classList.add('active');
        }
        else {
            const target = document.querySelector(`.msidebar-item[data-pane="${paneId}"]`);
            if (target)
                target.classList.add('active');
        }
        // Show pane
        const panes = document.querySelectorAll('.settings-pane');
        panes.forEach(p => p.classList.add('hidden'));
        
        const targetPane = document.getElementById(`pane-${paneId}`);
        if (targetPane)
            targetPane.classList.remove('hidden');
        else
            console.error(`Settings pane not found for ID: pane-${paneId}`);
    }
    switchPanelTab(tabId, el = null) {
        const tabs = document.querySelectorAll('.panel-tab');
        tabs.forEach(t => t.classList.remove('active'));
        
        const targetTab = el || document.querySelector(`.panel-tab[data-tab="${tabId}"]`);
        if (targetTab)
            targetTab.classList.add('active');
        
        const contents = document.querySelectorAll('.panel-content');
        contents.forEach(c => c.classList.add('hidden'));
        
        // Convert 'mcp' to 'Mcp'
        const camelTabId = tabId.charAt(0).toUpperCase() + tabId.slice(1);
        const target = document.getElementById(`panel${camelTabId}`);
        if (target)
            target.classList.remove('hidden');
    }
    showToast(message, type = 'info') {
        if (!this.toastContainer)
            return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    renderMarkdown(content, container, opts = {}) {
        const safeContent = content ?? '';
        if (window.marked && container) {
            container.innerHTML = window.marked.parse(safeContent);
            if (window.Prism && !opts.skipHighlight)
                window.Prism.highlightAllUnder(container);
        }
        else if (container) {
            container.textContent = safeContent;
        }
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
    toggleRightPanel() {
        const panel = document.getElementById('rightPanel');
        const btn = document.getElementById('panelToggleBtn');
        if (panel) {
            panel.classList.toggle('collapsed');
            if (btn)
                btn.classList.toggle('active');
        }
    }
    async checkConnection() {
        const badge = document.getElementById('connectionBadge');
        if (!badge)
            return;
        const agentSelect = document.getElementById('agentSelect');
        const agentName = agentSelect?.value || 'auto';
        const agentToProvider = {
            'geminiAgent': 'gemini',
            'local': 'ollama',
            'deepseekAgent': 'deepseek',
            'mathTutor': 'openai',
            'triage': 'openai',
            'master': 'openai',
            'historyTutor': 'openai',
            'analyzer': 'openai',
            'reasoner': 'openai'
        };
        const provider = agentToProvider[agentName] || window.appData.settings?.ai?.defaultProvider || 'openai';
        const keys = window.appData.settings?.apiKeys || {};
        const keyMap = {
            openai: keys.openai,
            claude: keys.anthropic,
            gemini: keys.gemini,
            deepseek: keys.deepseek,
            ollama: true
        };
        const hasKey = keyMap[provider];
        if (hasKey) {
            badge.textContent = 'Connected';
            badge.className = 'connection-badge connected';
        }
        else {
            badge.textContent = 'Disconnected';
            badge.className = 'connection-badge offline';
        }
    }
    setArtifactView(view) {
        const tabs = document.querySelectorAll('.art-tab');
        tabs.forEach(t => t.classList.remove('active'));
        if (view === 'preview') {
            tabs[0]?.classList.add('active');
            // Logic to show preview
        }
        else {
            tabs[1]?.classList.add('active');
            // Logic to show code
        }
    }
    closeArtifact() {
        const panel = document.getElementById('artifactPanel');
        if (panel)
            panel.classList.remove('visible');
    }
    closeOnOutside(event, modalId, closeFn) {
        if (event.target.id === modalId) {
            closeFn();
        }
    }
    handleKey(e, sendMessage) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }
}
export const uiController = new UIController();
