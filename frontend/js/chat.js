 'use strict';

/**

FoxAI - Chat Logic Engine v2.0.26

Core Logic: Handling Message streams, IA Synchronization, and Real-time Sockets.

Author: Jefferson Stivem Mendez

Dependencies: Socket.io, FoxUI (ui.js)
*/

const ChatEngine = (() => {
// --- PRIVATE CONFIGURATION ---
const SETTINGS = {
ENDPOINTS: {
CHAT: "https://foxai-backend.onrender.com/api/chat",
HISTORY: "https://foxai-backend.onrender.com/api/history",
STATUS: "https://foxai-backend.onrender.com/api/system/status"
},
SOCKET_URL: "https://foxai-backend.onrender.com",
MAX_MESSAGE_LENGTH: 2000,
TYPING_TIMEOUT: 3000,
RECONNECT_INTERVAL: 5000,
LOCAL_STORAGE_KEY: "foxai_chat_history_v1"
};

// --- INTERNAL STATE ---
let state = {
    socket: null,
    isConnected: false,
    isTyping: false,
    lastTypingTime: 0,
    messageQueue: [],
    currentConversationId: 'default_chat',
    history: JSON.parse(localStorage.getItem(SETTINGS.LOCAL_STORAGE_KEY)) || [],
    user: JSON.parse(localStorage.getItem('foxai_session_data')) || { name: 'Jefferson' },
    iaStatus: 'online'
};

// --- INITIALIZATION ---
const init = () => {
    console.log("%c [FoxAI Chat Engine] Ready for Transmission ", "background: #000; color: #0f0; font-weight: bold;");
    
    setupSocket();
    loadHistory();
    bindEvents();
    checkSystemHealth();
};

// --- SOCKET.IO LOGIC ---
const setupSocket = () => {
    if (typeof io === 'undefined') {
        console.error("Socket.io library not found.");
        return;
    }

    state.socket = io(SETTINGS.SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: SETTINGS.RECONNECT_INTERVAL,
        transports: ['websocket']
    });

    state.socket.on('connect', () => {
        state.isConnected = true;
        updateStatusUI('Conectado');
        console.log("[Socket] Connection Established");
    });

    state.socket.on('disconnect', () => {
        state.isConnected = false;
        updateStatusUI('Desconectado');
        console.log("[Socket] Lost Connection");
    });

    state.socket.on('ia_response', (data) => {
        handleIncomingMessage(data);
    });

    state.socket.on('typing_started', () => {
        showTypingIndicator(true);
    });

    state.socket.on('typing_stopped', () => {
        showTypingIndicator(false);
    });
};

// --- MESSAGE HANDLING ---
const sendMessage = async () => {
    const input = document.getElementById('messageInput');
    const text = input ? input.value.trim() : '';

    if (!validateInput(text)) return;

    // Reset UI Input
    input.value = '';
    input.style.height = 'auto';

    // 1. Render User Message immediately
    const userMsg = {
        id: Date.now(),
        role: 'user',
        content: sanitize(text),
        timestamp: new Date().toISOString()
    };

    renderMessage(userMsg);
    saveMessage(userMsg);

    // 2. Start Processing State
    showTypingIndicator(true);
    updateStatusUI('FoxAI está escribiendo...');

    // 3. Emit via Socket if available, otherwise fallback to REST
    if (state.isConnected) {
        state.socket.emit('send_message', {
            message: text,
            user: state.user,
            chatId: state.currentConversationId
        });
    }

    // 4. Always backup with REST for Groq API processing
    try {
        const response = await fetch(SETTINGS.ENDPOINTS.CHAT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                userId: state.user.id || 'jefferson_18',
                context: state.history.slice(-5) // Send last 5 for context
            })
        });

        if (!response.ok) throw new Error('Network Failure');

        const data = await response.json();
        handleIncomingMessage({
            role: 'ai',
            content: data.reply || data.content,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("[ChatEngine] REST Fallback Error:", error);
        handleOfflineSimulation(text);
    }
};

const handleIncomingMessage = (msg) => {
    showTypingIndicator(false);
    updateStatusUI('En línea');

    const aiMsg = {
        id: Date.now(),
        role: 'ai',
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString()
    };

    renderMessage(aiMsg);
    saveMessage(aiMsg);
    scrollToBottom();
};

// --- UI INTERACTION ---
const renderMessage = (msg) => {
    const container = document.getElementById('messagesBox');
    if (!container) return;

    const row = document.createElement('div');
    row.className = `message-row ${msg.role} animate__animated animate__fadeInUp`;
    row.id = `msg-${msg.id}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    // Advanced Text Formatting
    let formatted = formatText(msg.content);
    bubble.innerHTML = formatted;

    row.appendChild(bubble);
    container.appendChild(row);
    scrollToBottom();
};

const formatText = (text) => {
    // Handle code blocks
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Handle bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Handle line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
};

const showTypingIndicator = (show) => {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = show ? 'flex' : 'none';
        scrollToBottom();
    }
};

const scrollToBottom = () => {
    const container = document.getElementById('messagesBox');
    if (container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }
};

const updateStatusUI = (status) => {
    const statusEl = document.getElementById('aiStatus');
    if (statusEl) {
        const color = status === 'Desconectado' ? '#ff3b30' : '#34c759';
        statusEl.innerHTML = `<span class="status-dot" style="background: ${color}"></span> ${status}`;
    }
};

// --- SYSTEM LOGIC ---
const validateInput = (text) => {
    if (!text || text.length === 0) return false;
    if (text.length > SETTINGS.MAX_MESSAGE_LENGTH) {
        if (window.FoxUI) window.FoxUI.notify("Mensaje demasiado largo", "error");
        return false;
    }
    return true;
};

const sanitize = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const handleOfflineSimulation = (input) => {
    // Intelligent Fallback for Local Mode
    setTimeout(() => {
        let reply = "Lo siento, Jefferson. Mi conexión con el backend de Render está fallando. ¿Podrías revisar si el servidor está activo?";
        
        if (input.toLowerCase().includes("hola")) reply = "¡Hola! Estoy funcionando en modo local. Conéctame a internet para usar Groq Llama 3.";
        if (input.toLowerCase().includes("reparar")) reply = "Como técnico, te sugiero revisar primero los voltajes de entrada. Mi base de datos de hardware está offline ahora.";

        handleIncomingMessage({ content: reply });
    }, 1500);
};

// --- PERSISTENCE ---
const saveMessage = (msg) => {
    state.history.push(msg);
    localStorage.setItem(SETTINGS.LOCAL_STORAGE_KEY, JSON.stringify(state.history));
    
    // Sync with MongoDB in background if possible
    if (state.isConnected) {
        fetch(SETTINGS.ENDPOINTS.HISTORY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, userId: state.user.id })
        }).catch(e => console.log("Silent DB fail"));
    }
};

const loadHistory = () => {
    const container = document.getElementById('messagesBox');
    if (!container) return;

    // Clear only if history exists
    if (state.history.length > 0) {
        container.innerHTML = '';
        state.history.forEach(msg => renderMessage(msg));
    }
};

const clearHistory = () => {
    if (confirm("¿Limpiar todo el historial de FoxAI?")) {
        state.history = [];
        localStorage.removeItem(SETTINGS.LOCAL_STORAGE_KEY);
        const container = document.getElementById('messagesBox');
        if (container) container.innerHTML = '';
        
        handleIncomingMessage({ 
            content: "Memoria purgada. Nueva sesión de IA lista para Jefferson." 
        });
    }
};

// --- EVENT BINDING ---
const bindEvents = () => {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (sendBtn) {
        sendBtn.onclick = (e) => {
            e.preventDefault();
            sendMessage();
        };
    }

    if (input) {
        input.oninput = () => {
            handleTypingBroadcast();
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
    }
};

const handleTypingBroadcast = () => {
    if (!state.isConnected) return;

    const now = Date.now();
    if (now - state.lastTypingTime > SETTINGS.TYPING_TIMEOUT) {
        state.socket.emit('typing', { user: state.user.name });
        state.lastTypingTime = now;
        
        setTimeout(() => {
            state.socket.emit('stop_typing', { user: state.user.name });
        }, SETTINGS.TYPING_TIMEOUT);
    }
};

const checkSystemHealth = async () => {
    try {
        const res = await fetch(SETTINGS.ENDPOINTS.STATUS);
        if (res.ok) updateStatusUI('En línea');
    } catch (e) {
        updateStatusUI('Modo Local (Offline)');
    }
};

// --- PUBLIC API ---
return {
    init,
    send: sendMessage,
    clear: clearHistory,
    getStatus: () => state.isConnected,
    loadChat: (id) => {
        state.currentConversationId = id;
        loadHistory();
    }
};
})();

// Execution
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', ChatEngine.init);
} else {
ChatEngine.init();
}

/** * EXTRA UTILITIES FOR MULTI-CHAT

Managing sidebar conversations logic
*/
const ChatManager = {
createNew: () => {
const chatList = document.getElementById('chatsHistory');
if (!chatList) return;

 const newId = 'chat_' + Date.now();
 const item = document.createElement('div');
 item.className = 'chat-item';
 item.innerHTML = `
     <div class="ai-avatar" style="width: 45px; height: 45px; border-radius: 12px;">
         <i class="fas fa-robot"></i>
     </div>
     <div class="chat-info">
         <div class="chat-name-row">
             <span class="chat-name">Nueva Consulta</span>
             <span class="chat-time">Ahora</span>
         </div>
         <p class="chat-preview">Esperando mensaje...</p>
     </div>
 `;

 item.onclick = () => {
     document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
     item.classList.add('active');
     ChatEngine.loadChat(newId);
 };

 chatList.prepend(item);
 item.click();
}
};

/**

AUTO-EXPAND TEXTAREA LOGIC

Integrated directly for performance
*/
const autoExpand = (field) => {
field.style.height = 'inherit';
const computed = window.getComputedStyle(field);
const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
+ parseInt(computed.getPropertyValue('padding-top'), 10)
+ field.scrollHeight
+ parseInt(computed.getPropertyValue('padding-bottom'), 10)
+ parseInt(computed.getPropertyValue('border-bottom-width'), 10);

field.style.height = height + 'px';
};

document.addEventListener('input', (event) => {
if (event.target.id !== 'messageInput') return;
autoExpand(event.target);
});

/**

SECURITY MODULE

Basic protection for the engine
*/
const SecurityModule = {
checkOrigin: () => {
const allowed = ['vercel.app', 'localhost'];
const current = window.location.hostname;
return allowed.some(domain => current.includes(domain));
},
validateSession: () => {
const token = localStorage.getItem('foxai_token');
if (!token && !window.location.pathname.includes('index')) {
// Silence fail - ui.js handles redirect
return false;
}
return true;
}
};

// Global Exposure
window.sendMessage = ChatEngine.send;
window.clearCurrentChat = ChatEngine.clear;
window.createNewChat = ChatManager.createNew;

/* End of chat.js Engine */