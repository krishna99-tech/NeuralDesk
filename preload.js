const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openMCPConfig: () => ipcRenderer.invoke("open-mcp-config"),
  readJson: (relativePath) => ipcRenderer.invoke("read-json-file", relativePath),
  writeJson: (relativePath, data) => ipcRenderer.invoke("write-json-file", { relativePath, data }),
  getAppSettings: () => ipcRenderer.invoke("get-app-settings"),
  saveAppSettings: (settings) => ipcRenderer.invoke("save-app-settings", settings),
  getMcpConfig: () => ipcRenderer.invoke("get-mcp-config"),
  getMcpStatuses: () => ipcRenderer.invoke("get-mcp-statuses"),
  startMcpServers: () => ipcRenderer.invoke("start-mcp-servers"),
  addMcpServer: (server) => ipcRenderer.invoke("add-mcp-server", server),
  removeMcpServer: (name) => ipcRenderer.invoke("remove-mcp-server", name),
  signup: (creds) => ipcRenderer.invoke("signup", creds),
  login: (creds) => ipcRenderer.invoke("login", creds),
  getUserChats: (userId) => ipcRenderer.invoke("get-user-chats", userId),
  saveUserChats: (userId, chats) => ipcRenderer.invoke("save-user-chats", { userId, chats }),
  invokeLlm: (payload) => ipcRenderer.invoke("invoke-llm", payload),
  invokeLlmStream: (payload) => ipcRenderer.invoke("invoke-llm-stream", payload),
  cancelLlmStream: (requestId) => ipcRenderer.invoke("cancel-llm-stream", requestId),
  onLlmStreamChunk: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("llm-stream-chunk", listener);
    return () => ipcRenderer.removeListener("llm-stream-chunk", listener);
  }
});

// User requested standard API bridge
contextBridge.exposeInMainWorld("api", {
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  getData: () => ipcRenderer.invoke("get-data"),
  askAI: (payload) => ipcRenderer.invoke("ask-ai", payload)
});
