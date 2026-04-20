 'use strict';

/**

FoxAI - UI Engine v2.0.26

Lead Developer: Jefferson Stivem Mendez

Purpose: Global UI state management, animations, and system orchestration.

Target Platforms: Vercel (Frontend), Render (Backend), MongoDB Atlas (DB).
*/

const FoxUI = (() => {
// --- PRIVATE CONFIGURATION ---
const CONFIG = {
VERSION: "2.0.26",
STORAGE_KEY: "foxai_session_data",
BACKEND_URL: "https://foxai-backend.onrender.com",
THEME_KEY: "foxai_theme_preference",
ANIMATION_SPEED: 400,
TOAST_DURATION: 3500
};

// --- SYSTEM STATE ---
let state = {
    user: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || null,
    isSidebarOpen: true,
    currentView: window.location.pathname,
    isSocketConnected: false,
    theme: localStorage.getItem(CONFIG.THEME_KEY) || 'light',
    isLoading: false,
    notifications: [],
    device: {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        platform: navigator.platform
    }
};

// --- CORE INITIALIZATION ---
const init = () => {
    console.log(`%c FoxAI UI Engine v${CONFIG.VERSION} Active `, 'background: #000; color: #fff; font-weight: bold;');
    
    applyTheme();
    setupGlobalListeners();
    setupResponsiveUI();
    initSocketConnection();
    checkUserSession();
    
    // Final UI cleanup
    document.body.classList.add('foxai-loaded');
};

// --- UI HELPERS & UTILITIES ---
const utils = {
    /**
     * Debounce function for performance optimization
     */
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function for scroll/resize events
     */
    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Basic input sanitization to prevent XSS
     */
    sanitize: (str) => {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    /**
     * Formats dates for the chat/dashboard
     */
    formatDate: (date) => {
        return new Intl.DateTimeFormat('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        }).format(new Date(date));
    }
};

// --- GLOBAL UI HANDLERS ---

/**
 * Toggles between Sidebar states
 */
const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main-content');
    
    if (!sidebar) return;

    state.isSidebarOpen = !state.isSidebarOpen;
    
    if (state.isSidebarOpen) {
        sidebar.classList.remove('sidebar-collapsed');
        if (main) main.classList.remove('main-expanded');
    } else {
        sidebar.classList.add('sidebar-collapsed');
        if (main) main.classList.add('main-expanded');
    }
};

/**
 * Show/Hide Global Loader
 */
const setLoader = (active) => {
    state.isLoading = active;
    let loader = document.getElementById('fox-global-loader');

    if (active) {
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'fox-global-loader';
            loader.innerHTML = '<div class="loader-spinner"></div>';
            document.body.appendChild(loader);
        }
        loader.style.display = 'flex';
        loader.classList.add('animate__fadeIn');
    } else {
        if (loader) {
            loader.classList.replace('animate__fadeIn', 'animate__fadeOut');
            setTimeout(() => { loader.style.display = 'none'; }, 500);
        }
    }
};

/**
 * Toast Notification System
 */
const notify = (message, type = 'success') => {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
        warning: 'fa-bell'
    };

    toast.className = `fox-toast toast-${type} animate__animated animate__slideInRight`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.replace('animate__slideInRight', 'animate__fadeOut');
        setTimeout(() => { toast.remove(); }, 1000);
    }, CONFIG.TOAST_DURATION);
};

const createToastContainer = () => {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(container);
    return container;
};

// --- THEME MANAGEMENT ---
const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', state.theme);
    if (state.theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
};

const toggleTheme = () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(CONFIG.THEME_KEY, state.theme);
    applyTheme();
    notify(`Modo ${state.theme === 'dark' ? 'oscuro' : 'claro'} activado`);
};

// --- NAVIGATION CONTROL ---
const navigateTo = (view) => {
    setLoader(true);
    setTimeout(() => {
        window.location.href = view;
    }, CONFIG.ANIMATION_SPEED);
};

// --- BACKEND & DATA FETCHING ---
const api = {
    /**
     * Standardized Fetch with error handling
     */
    request: async (endpoint, options = {}) => {
        const url = `${CONFIG.BACKEND_URL}${endpoint}`;
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('foxai_token')}`
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...defaultHeaders, ...options.headers }
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            return await response.json();
        } catch (error) {
            console.error("API Request Failed:", error);
            notify("Error de conexión con el servidor", "error");
            return null;
        }
    },

    /**
     * Fetch System Stats for Dashboard
     */
    getStats: async () => {
        return await api.request('/api/stats');
    },

    /**
     * Fetch User Info from MongoDB
     */
    getUserProfile: async (id) => {
        return await api.request(`/api/users/${id}`);
    }
};

// --- SOCKET.IO HANDLING ---
const initSocketConnection = () => {
    if (typeof io === 'undefined') return;

    const socket = io(CONFIG.BACKEND_URL, {
        reconnectionAttempts: 5,
        timeout: 10000
    });

    socket.on('connect', () => {
        state.isSocketConnected = true;
        updateSystemStatus(true);
        console.log("FoxAI Sockets Linked.");
    });

    socket.on('disconnect', () => {
        state.isSocketConnected = false;
        updateSystemStatus(false);
        notify("Conexión perdida. Reintentando...", "warning");
    });

    socket.on('ai_typing', (data) => {
        if (window.location.pathname.includes('chat')) {
            const indicator = document.getElementById('typingIndicator');
            if (indicator) indicator.style.display = 'flex';
        }
    });

    socket.on('ai_stop_typing', () => {
        if (window.location.pathname.includes('chat')) {
            const indicator = document.getElementById('typingIndicator');
            if (indicator) indicator.style.display = 'none';
        }
    });

    return socket;
};

const updateSystemStatus = (online) => {
    const badge = document.querySelector('.system-status');
    if (badge) {
        badge.style.color = online ? 'var(--success)' : 'var(--error)';
        badge.innerHTML = `<span class="status-dot"></span> IVH-X Engine: ${online ? 'Activo' : 'Offline'}`;
    }
};

// --- EVENT LISTENERS ---
const setupGlobalListeners = () => {
    // Toggle Sidebar
    document.addEventListener('click', (e) => {
        if (e.target.closest('#toggleSidebar') || e.target.closest('#toggleMenu')) {
            toggleSidebar();
        }

        // Button Click Ripple Effect
        if (e.target.classList.contains('btn') || e.target.closest('.btn')) {
            createRipple(e);
        }
    });

    // Window Resize Logic
    window.addEventListener('resize', utils.throttle(() => {
        setupResponsiveUI();
    }, 200));

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
};

const setupResponsiveUI = () => {
    const width = window.innerWidth;
    state.device.isMobile = width <= 800;

    const sidebar = document.querySelector('.sidebar');
    if (state.device.isMobile && sidebar) {
        sidebar.classList.add('sidebar-collapsed');
        state.isSidebarOpen = false;
    }
};

const createRipple = (event) => {
    const button = event.target.closest('.btn');
    if (!button) return;

    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
    circle.classList.add("ripple");

    const ripple = button.getElementsByClassName("ripple")[0];
    if (ripple) ripple.remove();

    button.appendChild(circle);
};

// --- SESSION MANAGEMENT ---
const checkUserSession = () => {
    if (!state.user && !window.location.pathname.includes('index')) {
        console.warn("No session found. Redirecting to onboarding.");
        window.location.href = 'index.html';
    }

    if (state.user && window.location.pathname.includes('index')) {
        console.log("Active session found. Redirecting to chat.");
        window.location.href = 'chat.html';
    }
};

const logout = () => {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem('foxai_token');
    localStorage.removeItem('foxai_chat_history');
    notify("Sesión cerrada. Reiniciando núcleo...", "info");
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
};

// --- COMPONENT HANDLERS ---

/**
 * Controls Dynamic Progress Bars (Dashboard)
 */
const updateProgress = (id, percent) => {
    const bar = document.getElementById(id);
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.parentElement.previousElementSibling.querySelector('span:last-child').innerText = `${percent}%`;
    }
};

/**
 * Modal Controller
 */
const modal = {
    show: (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'flex';
            el.classList.add('animate__fadeIn');
        }
    },
    hide: (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.replace('animate__fadeIn', 'animate__fadeOut');
            setTimeout(() => { el.style.display = 'none'; }, 300);
        }
    }
};

/**
 * Form Validation Helper
 */
const validateForm = (formData) => {
    let errors = [];
    for (const [key, value] of Object.entries(formData)) {
        if (!value || value.trim() === '') {
            errors.push(`El campo ${key} es obligatorio.`);
        }
    }
    return errors;
};

// --- REFINEMENT & EXTENSIONS ---

// Auto-executing init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// --- PUBLIC API ---
return {
    // State access
    getState: () => ({ ...state }),
    
    // UI Actions
    toggleSidebar,
    toggleTheme,
    setLoader,
    notify,
    navigateTo,
    
    // Data/Backend
    api,
    logout,
    
    // Components
    modal,
    updateProgress,
    
    // Utils
    utils,
    validateForm,
    
    // Direct refs for specific views
    refreshDashboard: fetchBackendStats = () => api.getStats().then(data => data && updateDashboardData(data))
};
})();

/**

--- UI STYLES INJECTION ---

Adding dynamic ripple and custom transition styles

that are not part of the standard CSS to ensure smooth UI behavior.
*/
const injectStyles = () => {
const style = document.createElement('style');
style.textContent = .ripple { position: absolute; border-radius: 50%; transform: scale(0); animation: ripple 600ms linear; background-color: rgba(255, 255, 255, 0.3); } @keyframes ripple { to { transform: scale(4); opacity: 0; } } .fox-toast { min-width: 250px; padding: 16px 24px; background: #fff; color: #000; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; font-weight: 700; border: 1px solid rgba(0,0,0,0.05); } .toast-error { border-left: 5px solid #ff3b30; } .toast-success { border-left: 5px solid #34c759; } .toast-warning { border-left: 5px solid #ff9500; } .sidebar-collapsed { width: 80px !important; } .sidebar-collapsed .brand-name,  .sidebar-collapsed .menu-link span, .sidebar-collapsed .user-pill div { display: none; } .main-expanded { margin-left: 80px !important; } #fox-global-loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; } .loader-spinner { width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #000; border-radius: 50%; animation: spin 1s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .dark-mode #fox-global-loader { background: rgba(0,0,0,0.9); } .dark-mode .fox-toast { background: #1c1c1e; color: #fff; border-color: #333; };
document.head.appendChild(style);
};

injectStyles();

/**

--- PAGE SPECIFIC BINDINGS ---

Logic that links specific HTML IDs to FoxUI functions.
*/

// Dashboard update trigger
if (document.getElementById('refreshDashboard')) {
document.getElementById('refreshDashboard').onclick = FoxUI.refreshDashboard;
}

// Onboarding steps handling via FoxUI
const handleOnboarding = (step) => {
FoxUI.setLoader(true);
setTimeout(() => {
const next = document.getElementById(step${step});
if (next) {
document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
next.classList.add('active');
}
FoxUI.setLoader(false);
}, 600);
};

// Expose to window for inline HTML calls
window.FoxUI = FoxUI;
window.handleOnboarding = handleOnboarding;

/** * End of ui.js

Total functionality: Navigation, State, Theme, API, Sockets, and Components.

Designed for High-Performance interactions on Jefferson's FoxAI system.
*/