const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// Environment
const isDev = !app.isPackaged;

// Portable Mode Support: Save data in the app directory instead of %APPDATA%
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, "NeuralDesk_Data");
  if (!fs.existsSync(portableDataPath)) {
    fs.mkdirSync(portableDataPath, { recursive: true });
    if (process.platform === "win32") {
      exec(`attrib +h "${portableDataPath}"`);
    }
  }
  app.setPath("userData", portableDataPath);
  app.setPath("sessionData", path.join(portableDataPath, "SessionData"));
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0a0f",
    title: "NeuralDesk",
    autoHideMenuBar: !isDev,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      devTools: isDev
    }
  });

  mainWindow.loadFile("index.html");

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  // Initialize modular IPC handlers
  require("./main/ipc/handlers");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
