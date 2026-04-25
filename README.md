# NeuralDesk Desktop

NeuralDesk is an Electron-based desktop AI client with:

- Multi-provider model support (Gemini, Anthropic, OpenAI-compatible, Ollama)
- Streaming responses with stop/cancel generation
- Local desktop settings and API key storage
- MCP server configuration from UI
- Config-driven UI sections via JSON files

## Features

- **Desktop app** built with Electron
- **Model routing** by selected model in dropdown
- **Gemini/OpenAI/Ollama integration** for real chat responses
- **Connection status badge** for selected model
- **MCP management**
  - Add MCP servers from Settings UI
  - Remove MCP servers from Settings UI
  - View MCP servers in right-side MCP panel
  - Execute configured MCP commands from chat when `MCP` tool is selected
  - Open and edit local MCP config JSON
- **Agent/Config data split** into `data/*.json`

## Project Structure

- `index.html` - Main UI and renderer logic
- `main.js` - Electron main process, secure IPC, LLM calls
- `preload.js` - Safe renderer API bridge

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm
- Windows (current scripts/package target `win32 x64`)

## Install

```bash
npm install
```

## Run in Development

```bash
npm start
```

or

```bash
npm run dev
```

## Build Production Package

```bash
npm run dist:prod
```

Output:

- `dist/NeuralDesk-win32-x64`
