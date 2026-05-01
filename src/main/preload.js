const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    askAI: (payload) => ipcRenderer.invoke('ask-ai', payload),
    getModels: () => ipcRenderer.invoke('get-models'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveData: (key, data) => ipcRenderer.invoke('save-data', { key, data }),
    getData: (key) => ipcRenderer.invoke('get-data-key', key),
    getMcpConfig: () => ipcRenderer.invoke('get-mcp-config'),
    saveMcpConfig: (config) => ipcRenderer.invoke('save-mcp-config', config),
    getMcpStatuses: () => ipcRenderer.invoke('get-mcp-statuses'),
    getToolCalls: (limit = 100) => ipcRenderer.invoke('get-tool-calls', limit),
    exportToolCalls: () => ipcRenderer.invoke('export-tool-calls'),
    vaultSetSecret: (name, value) => ipcRenderer.invoke('vault-set-secret', { name, value }),
    vaultGetSecret: (name) => ipcRenderer.invoke('vault-get-secret', name),
    vaultDeleteSecret: (name) => ipcRenderer.invoke('vault-delete-secret', name),
    vaultListMeta: () => ipcRenderer.invoke('vault-list-meta'),
    launchOAuth: (payload) => ipcRenderer.invoke('oauth-launch', payload),
    openMcpConfigFile: () => ipcRenderer.invoke('open-mcp-config-file'),
    clearSession: (chatId) => ipcRenderer.invoke('clear-session', chatId),
    signup: (creds) => ipcRenderer.invoke('signup', creds),
    login: (creds) => ipcRenderer.invoke('login', creds),
    logout: () => ipcRenderer.invoke('logout'),
    deleteChat: (chatId) => ipcRenderer.invoke('deleteChat', chatId),
    onToolEvent: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('tool-event', subscription);
        return () => ipcRenderer.removeListener('tool-event', subscription);
    },
    onAIStream: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('ai-stream', subscription);
        return () => ipcRenderer.removeListener('ai-stream', subscription);
    }
});
