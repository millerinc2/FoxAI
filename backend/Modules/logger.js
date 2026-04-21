 'use strict';

/**
 * FoxAI - Advanced Logging & Audit System v2.0.26
 * Core Logic: File System Persistence, MongoDB Audit, and Performance Monitoring.
 * Target Platform: Node.js (Render)
 * Author: Jefferson Stivem Mendez
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// --- CONFIGURACIÓN DEL SISTEMA ---
const CONFIG = {
    LOG_DIR: path.join(__dirname, '../Logs'), // Ajustado para subir un nivel desde Modules
    LEVELS: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        SECURITY: 4,
        AI: 5
    },
    CURRENT_LEVEL: process.env.LOG_LEVEL || 1,
    ENABLE_CONSOLE: process.env.LOG_CONSOLE === 'true' || true, // Forzado a true para ver logs en Render
    ENABLE_MONGO: process.env.LOG_MONGO === 'true',
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    RETENTION_DAYS: 7
};

// --- INICIALIZACIÓN DE DIRECTORIOS ---
if (!fs.existsSync(CONFIG.LOG_DIR)) {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

/**
 * Clase Principal del Logger
 */
class FoxLogger extends EventEmitter {
    constructor() {
        super();
        this.streams = {
            app: path.join(CONFIG.LOG_DIR, 'app.log'),
            error: path.join(CONFIG.LOG_DIR, 'error.log'),
            ai: path.join(CONFIG.LOG_DIR, 'ai.log'),
            security: path.join(CONFIG.LOG_DIR, 'security.log')
        };
        this.initRotationCheck();
    }

    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
    }

    getDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Formateador de mensajes centralizado
     * CORRECCIÓN: Sintaxis de concatenación y Template Literals
     */
    formatMessage(level, message, context = {}) {
        const timestamp = this.getTimestamp();
        const ctxString = Object.keys(context).length ? ` | Data: ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctxString}${os.EOL}`;
    }

    async logToFile(fileKey, message) {
        const filePath = this.streams[fileKey] || this.streams.app;
        try {
            await this.checkFileSize(filePath);
            fs.appendFileSync(filePath, message, 'utf8');
        } catch (err) {
            console.error(`[CRITICAL] Fallo al escribir log en ${filePath}:`, err);
        }
    }

    async logToMongo(level, message, context) {
        if (!CONFIG.ENABLE_MONGO) return;
        try {
            this.emit('mongo_log', {
                timestamp: new Date(),
                level,
                message,
                context,
                server: os.hostname()
            });
        } catch (err) {
            this.logToFile('error', this.formatMessage('error', 'Fallo en logToMongo', { err: err.message }));
        }
    }

    logToConsole(level, message) {
        if (!CONFIG.ENABLE_CONSOLE) return;

        const colors = {
            INFO: '\x1b[32m',
            WARN: '\x1b[33m',
            ERROR: '\x1b[31m',
            DEBUG: '\x1b[36m',
            SECURITY: '\x1b[35m',
            AI: '\x1b[34m',
            RESET: '\x1b[0m'
        };

        const color = colors[level.toUpperCase()] || colors.RESET;
        process.stdout.write(`${color}${message}${colors.RESET}`);
    }

    async _write(level, message, context = {}, fileKey = 'app') {
        if (CONFIG.LEVELS[level.toUpperCase()] < CONFIG.CURRENT_LEVEL) return;

        const formatted = this.formatMessage(level, message, context);
        this.logToConsole(level, formatted);
        await this.logToFile(fileKey, formatted);
        await this.logToMongo(level, message, context);
    }

    info(msg, ctx = {}) { this._write('info', msg, ctx, 'app'); }
    warn(msg, ctx = {}) { this._write('warn', msg, ctx, 'app'); }
    error(msg, ctx = {}) {
        const errorCtx = ctx instanceof Error ? { message: ctx.message, stack: ctx.stack } : ctx;
        this._write('error', msg, errorCtx, 'error');
    }
    debug(msg, ctx = {}) { this._write('debug', msg, ctx, 'app'); }
    security(msg, ctx = {}) { this._write('security', msg, ctx, 'security'); }
    ai(input, output, stats = {}) {
        const message = `Prompt: ${input.substring(0, 50)}... -> Response: ${output.substring(0, 50)}...`;
        this._write('ai', message, { input, output, ...stats }, 'ai');
    }

    httpMiddleware() {
        return (req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
                const ctx = { ip: req.ip, ua: req.get('User-Agent'), status: res.statusCode };
                if (res.statusCode >= 400) this.error(message, ctx);
                else this.info(message, ctx);
            });
            next();
        };
    }

    async trackExecution(label, fn) {
        const start = performance.now();
        this.debug(`Iniciando ejecución: ${label}`);
        try {
            const result = await fn();
            const end = performance.now();
            this.info(`Ejecución completada: ${label}`, { duration: `${(end - start).toFixed(2)}ms` });
            return result;
        } catch (err) {
            this.error(`Fallo en ejecución: ${label}`, err);
            throw err;
        }
    }

    async checkFileSize(filePath) {
        if (!fs.existsSync(filePath)) return;
        const stats = fs.statSync(filePath);
        if (stats.size >= CONFIG.MAX_FILE_SIZE) {
            const rotatedPath = `${filePath}.${this.getDateString()}.${Date.now()}.old`;
            fs.renameSync(filePath, rotatedPath);
        }
    }

    initRotationCheck() {
        setInterval(() => {
            fs.readdir(CONFIG.LOG_DIR, (err, files) => {
                if (err) return;
                const now = Date.now();
                files.forEach(file => {
                    if (!file.includes('.old')) return;
                    const filePath = path.join(CONFIG.LOG_DIR, file);
                    const stats = fs.statSync(filePath);
                    const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                    if (ageDays > CONFIG.RETENTION_DAYS) {
                        fs.unlinkSync(filePath);
                    }
                });
            });
        }, 1000 * 60 * 60 * 24);
    }

    captureGlobalErrors() {
        process.on('uncaughtException', (err) => {
            this.error('CRITICAL: Uncaught Exception', err);
            setTimeout(() => process.exit(1), 1000);
        });
        process.on('unhandledRejection', (reason) => {
            this.error('CRITICAL: Unhandled Rejection', { reason });
        });
    }

    sanitize(data) {
        const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];
        const sanitized = { ...data };
        Object.keys(sanitized).forEach(key => {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) sanitized[key] = '********';
            else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) sanitized[key] = this.sanitize(sanitized[key]);
        });
        return sanitized;
    }
}

const instance = new FoxLogger();

const log = {
    info: (m, c) => instance.info(m, c),
    warn: (m, c) => instance.warn(m, c),
    error: (m, c) => instance.error(m, c),
    debug: (m, c) => instance.debug(m, c),
    security: (m, c) => instance.security(m, c),
    ai: (i, o, s) => instance.ai(i, o, s),
    middleware: () => instance.httpMiddleware(),
    track: (l, f) => instance.trackExecution(l, f),
    init: () => instance.captureGlobalErrors()
};

const auditUserAction = async (userId, action, details) => {
    const message = `User Action: ${userId} -> ${action}`;
    instance.info(message, { userId, action, ...details });
    if (['login_fail', 'delete_account', 'change_password'].includes(action)) {
        instance.security(`CRITICAL ACTION: ${action}`, { userId, ...details });
    }
};

const systemMonitor = () => {
    setInterval(() => {
        const memory = process.memoryUsage();
        instance.debug('System Health Metrics', {
            rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`
        });
    }, 1000 * 60 * 15);
};

systemMonitor();

module.exports = {
    logger: log,
    audit: auditUserAction,
    FoxLoggerInstance: instance
};

process.on('SIGTERM', () => {
    instance.info('Servidor cerrándose. Finalizando procesos de logging...');
});