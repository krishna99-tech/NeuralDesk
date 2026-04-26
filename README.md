# NeuralDesk Desktop

NeuralDesk is a powerful, portable desktop AI client designed for seamless interaction with various AI models and local tools.

Key Highlights:

- **Multi-Provider AI**: Connects to Gemini, Anthropic, OpenAI-compatible, and Ollama models.
- **Real-time Interaction**: Enjoy streaming responses with the ability to stop or cancel generation.
- **True Portability**: Run the application from any location (e.g., USB drive) with all your data (settings, chats, configurations) self-contained and "roaming" with the executable.
- **Local Tool Integration (MCP)**: Configure and execute custom scripts or applications directly from the UI to enhance AI capabilities with local data analysis or automation.

## Features

- **Zero-Installation Portable Executable**: Simply run the `.exe` file; no setup required.
- **Dynamic Model Selection**: Easily switch between different AI models using a dropdown.
- **Intelligent Chat Responses**: Leverage Gemini, OpenAI, and Ollama for rich, contextual conversations.
- **Real-time Connection Status**: Monitor the connection health of your selected AI model.
- **MCP management**
  - **Effortless Configuration**: Add and remove MCP (Multi-Command Processor) servers directly from the Settings UI.
  - **Integrated Control**: View active MCP servers in a dedicated panel.
  - **AI-Powered Execution**: Trigger configured MCP commands from your chat prompts when the `MCP` tool is active, enabling AI to interact with local tools and data.
  - **Advanced Customization**: Directly open and edit the underlying `mcp_config.json` for fine-grained control.

## Development

- `npm.cmd run dev`: Start the Electron desktop app in JavaScript mode.
- `npm.cmd run start`: Start the Electron desktop app.
- `npm.cmd run dist`: Build a portable Windows package.

## Project Structure

```text
.
├─ assets/
├─ src/
│  ├─ main/
│  │  ├─ ai/
│  │  ├─ core/
│  │  ├─ db/
│  │  ├─ ipc/
│  │  ├─ mcp/
│  │  ├─ services/
│  │  ├─ main.js
│  │  └─ preload.js
│  └─ renderer/
│     ├─ css/
│     ├─ auth.js
│     ├─ chat.js
│     ├─ index.js
│     ├─ router.js
│     ├─ settings.js
│     ├─ toolUI.js
│     ├─ types.js
│     └─ ui.js
├─ index.html
├─ package.json
└─ README.md
```
