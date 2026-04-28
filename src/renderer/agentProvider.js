export function getProviderForAgent(agentName, defaultProvider = 'openai') {
    const map = {
        auto: defaultProvider || 'openai',
        geminiAgent: 'gemini',
        local: 'ollama',
        deepseekAgent: 'deepseek',
        mathTutor: 'openai',
        triage: 'openai',
        master: 'openai',
        historyTutor: 'openai',
        analyzer: 'openai',
        reasoner: 'claude',
        aipipeAgent: 'aipipe',
    };
    return map[agentName] || defaultProvider || 'openai';
}
