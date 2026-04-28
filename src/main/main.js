"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const sqlite_1 = __importDefault(require("./db/sqlite")); // Corrected relative path
const child_process_1 = require("child_process");
const isDev = !electron_1.app.isPackaged;
electron_1.app.name = "neuraldesk-desktop";
// Data is stored in AppData/Roaming/neuraldesk-desktop
const userDataPath = path.join(electron_1.app.getPath('appData'), 'neuraldesk-desktop');
electron_1.app.setPath('userData', userDataPath);
electron_1.app.setPath('sessionData', path.join(userDataPath, 'SessionData'));
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}



function createWindow() {
    const mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        title: 'NeuralDesk',
        autoHideMenuBar: !isDev,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            devTools: isDev
        }
    });
    const indexPath = path.join(__dirname, '../../index.html');
    mainWindow.loadFile(indexPath);

    // Optional: Open DevTools in development to help debug rendering issues
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
electron_1.app.whenReady().then(() => {
    // Load IPC handlers
    const { registerIpcHandlers, logAppEvent } = require('./ipc/handlers'); // Import logAppEvent from handlers.js
    registerIpcHandlers();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});

electron_1.app.on('before-quit', async (event) => {
    // Prevent default quit behavior until we're done with cleanup
    event.preventDefault();

    try {
        // Ensure SQLite is initialized before trying to access it
        // This is a simplified check; a more robust solution might involve a global ready state.
        // For now, assuming registerIpcHandlers has run and sqlite_1.default is available.
        const row = sqlite_1.default.prepare("SELECT data FROM settings WHERE id = 1").get();
        const settings = row ? JSON.parse(row.data) : {};
        const clearOnExit = settings.privacy?.clearOnExit;

        if (clearOnExit) {
            logAppEvent("INFO", "MainProcess", "APP_CLEANUP_START", "Clearing all chat history on exit.", { clearOnExit });
            sqlite_1.default.prepare("DELETE FROM chats").run();
            logAppEvent("INFO", "MainProcess", "APP_CLEANUP", "Chat history cleared successfully.");
            console.log("[Cleanup] Chat history cleared.");
        }
    } catch (err) {
        console.error("[Cleanup] Error during 'Clear Chat on Exit':", err.message);
        logAppEvent("ERROR", "MainProcess", "APP_CLEANUP_ERROR", `Error during 'Clear Chat on Exit': ${err.message}`, { error: err.message, stack: err.stack });
    } finally {
        // Allow the app to quit after cleanup (or error)
        electron_1.app.exit();
    }
});
