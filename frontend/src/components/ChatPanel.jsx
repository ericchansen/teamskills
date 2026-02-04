import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './ChatPanel.css';

const AGENT_URL = import.meta.env.VITE_AGENT_URL || 'http://localhost:8000';

function ChatPanel({ isOpen, onToggle }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState(null);
  const [currentToolCall, setCurrentToolCall] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentThinking, currentToolCall]);

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage = messageText.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setCurrentThinking(null);
    setCurrentToolCall(null);

    try {
      const response = await fetch(`${AGENT_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let toolCalls = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
              try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'thinking':
                  setCurrentThinking(data.content);
                  break;
                case 'tool_call':
                  setCurrentToolCall({ name: data.name, args: data.args });
                  toolCalls.push({ name: data.name, args: data.args });
                  break;
                case 'tool_result':
                  setCurrentToolCall(prev => 
                    prev ? { ...prev, result: data.result } : null
                  );
                  break;
                case 'content':
                  assistantContent += data.content;
                  setCurrentThinking(null);
                  setCurrentToolCall(null);
                  break;
                case 'done':
                  setCurrentThinking(null);
                  setCurrentToolCall(null);
                  break;
                case 'error':
                  throw new Error(data.content);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Add assistant message with any tool calls
      if (assistantContent || toolCalls.length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        }]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}`,
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
      setCurrentThinking(null);
      setCurrentToolCall(null);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) {
    return (
      <button 
        className="chat-toggle-btn"
        onClick={onToggle}
        title="Open chat assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">🤖 Skills Assistant</span>
        <button 
          className="chat-close-btn"
          onClick={onToggle}
          title="Close chat"
        >
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p>👋 Hi! I can help you find team members by skills.</p>
            <p className="chat-suggestions">Try asking:</p>
            <div className="suggestion-buttons">
              <button 
                className="suggestion-btn"
                onClick={() => handleSuggestionClick("Who knows Kubernetes?")}
              >
                Who knows Kubernetes?
              </button>
              <button 
                className="suggestion-btn"
                onClick={() => handleSuggestionClick("What skill gaps do we have?")}
              >
                What skill gaps do we have?
              </button>
              <button 
                className="suggestion-btn"
                onClick={() => handleSuggestionClick("Give me a team skills summary")}
              >
                Give me a team skills summary
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}
          >
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="tool-calls">
                {msg.toolCalls.map((tool, tidx) => (
                  <div key={tidx} className="tool-call-badge">
                    🔧 Used: {tool.name}
                  </div>
                ))}
              </div>
            )}
            <div className="message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Loading indicators */}
        {isLoading && (
          <div className="chat-loading">
            {currentThinking && (
              <div className="thinking-indicator">
                <span className="thinking-dots">🤔</span>
                <span className="thinking-text">{currentThinking}</span>
              </div>
            )}
            {currentToolCall && (
              <div className="tool-indicator">
                <span className="tool-icon">🔧</span>
                <span className="tool-text">
                  Using: {currentToolCall.name}
                  {currentToolCall.result && ' ✓'}
                </span>
              </div>
            )}
            {!currentThinking && !currentToolCall && (
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about team skills..."
          disabled={isLoading}
          className="chat-input"
        />
        <button 
          type="submit" 
          disabled={isLoading || !input.trim()}
          className="chat-send-btn"
        >
          {isLoading ? '...' : '→'}
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
