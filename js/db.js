/**
 * NeuralDesk Renderer Database Wrapper
 * Provides a clean interface to the SQLite backend.
 */

window.db = {
  /**
   * Find items in a collection (e.g. memories)
   */
  find: async (collection, query = {}) => {
    // Inject current user ID for personal collections
    if (window.state.user) query.userId = window.state.user.id;
    return await window.electronAPI.db.find(collection, query);
  },

  /**
   * Save a chat session to the database
   */
  saveChats: async (chats) => {
    if (!window.state.user) return;
    return await window.electronAPI.saveUserChats(window.state.user.id, chats);
  },

  /**
   * Fetch all chats for the current user
   */
  getChats: async () => {
    if (!window.state.user) return [];
    return await window.electronAPI.getUserChats(window.state.user.id);
  },

  /**
   * Settings operations
   */
  getSettings: async () => {
    return await window.electronAPI.getAppSettings();
  },

  saveSettings: async (settings) => {
    return await window.electronAPI.saveAppSettings(settings);
  }
};
