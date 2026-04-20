'use strict';

/**

FoxAI - Advanced Logging & Audit System v2.0.26

Core Logic: File System Persistence, MongoDB Audit, and Performance Monitoring.

Target Platform: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// --- CONFIGURACIÓN DEL SISTEMA ---
const CONFIG = {
LOG_DIR: path.join(__dirname, 'Logs'),
LEVELS: {
DEBUG: 0,
INFO: 1,
WARN: 2,
ERROR: 3,
SECURITY: 4,
AI: 5
},
CURRENT_LEVEL: process.env.LOG_LEVEL || 1,
ENABLE_CONSOLE: process.env.LOG_CONSOLE === 'true',
ENABLE_MONGO: process.env.LOG_MONGO === 'true',
MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
RETENTION_DAYS: 7
};

// --- INICIALIZACIÓN DE DIRECTORIOS ---
if (!fs.existsSync(CONFIG.LOG_DIR)) {
fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

/**

Clase Principal del Logger
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

/**

Formatea la fecha para los archivos y logs
*/
getTimestamp() {
const now = new Date();
return now.toISOString().replace(/T/, ' ').replace(/..+/, '');
}

getDateString() {
return new Date().toISOString().split('T')[0];
}

/**

Formateador de mensajes centralizado
*/
formatMessage(level, message, context = {}) {
const timestamp = this.getTimestamp();
const ctxString = Object.keys(context).length ?  | Data: ${JSON.stringify(context)} : '';
return [${timestamp}] [${level.toUpperCase()}] ${message}${ctxString}${os.EOL};
}

/**

Persistencia en archivos físicos
*/
async logToFile(fileKey, message) {
const filePath = this.streams[fileKey] || this.streams.app;
try {
await this.checkFileSize(filePath);
fs.appendFileSync(filePath, message, 'utf8');
} catch (err) {
console.error([CRITICAL] Fallo al escribir log en ${filePath}:, err);
}
}

/**

Integración con MongoDB para auditoría persistente
*/
async logToMongo(level, message, context) {
if (!CONFIG.ENABLE_MONGO) return;

try {
// Se asume que el modelo se importa globalmente o se inyecta
// Para evitar dependencias circulares, emitimos un evento que server.js escuchará
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

/**

Salida por consola con colores (solo desarrollo/Render logs)
*/
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
process.stdout.write(${color}${message}${colors.RESET});
}

/**

CORE: Proceso de Log General
*/
async _write(level, message, context = {}, fileKey = 'app') {
if (CONFIG.LEVELS[level.toUpperCase()] < CONFIG.CURRENT_LEVEL) return;

const formatted = this.formatMessage(level, message, context);

// Ejecución en paralelo para no bloquear el Event Loop
this.logToConsole(level, formatted);
await this.logToFile(fileKey, formatted);
await this.logToMongo(level, message, context);
}

// --- MÉTODOS PÚBLICOS DE NIVEL ---

info(msg, ctx = {}) {
this._write('info', msg, ctx, 'app');
}

warn(msg, ctx = {}) {
this._write('warn', msg, ctx, 'app');
}

error(msg, ctx = {}) {
const errorCtx = ctx instanceof Error ? {
message: ctx.message,
stack: ctx.stack,
...ctx
} : ctx;
this._write('error', msg, errorCtx, 'error');
}

debug(msg, ctx = {}) {
this._write('debug', msg, ctx, 'app');
}

security(msg, ctx = {}) {
this._write('security', msg, ctx, 'security');
}

ai(input, output, stats = {}) {
const message = Prompt: ${input.substring(0, 50)}... -> Response: ${output.substring(0, 50)}...;
this._write('ai', message, { input, output, ...stats }, 'ai');
}

// --- FUNCIONALIDADES AVANZADAS ---

/**

Middleware para Express: Log de peticiones HTTP
*/
httpMiddleware() {
return (req, res, next) => {
const start = Date.now();
res.on('finish', () => {
const duration = Date.now() - start;
const message = ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms;
const ctx = {
ip: req.ip,
ua: req.get('User-Agent'),
method: req.method,
status: res.statusCode
};

     if (res.statusCode >= 400) {
         this.error(message, ctx);
     } else {
         this.info(message, ctx);
     }
 });
 next();
};
}

/**

Métrica de tiempo de ejecución
*/
async trackExecution(label, fn) {
const start = performance.now();
this.debug(Iniciando ejecución: ${label});
try {
const result = await fn();
const end = performance.now();
this.info(Ejecución completada: ${label}, { duration: ${(end - start).toFixed(2)}ms });
return result;
} catch (err) {
this.error(Fallo en ejecución: ${label}, err);
throw err;
}
}

/**

Rotación de archivos por tamaño
*/
async checkFileSize(filePath) {
if (!fs.existsSync(filePath)) return;

const stats = fs.statSync(filePath);
if (stats.size >= CONFIG.MAX_FILE_SIZE) {
const rotatedPath = ${filePath}.${this.getDateString()}.${Date.now()}.old;
fs.renameSync(filePath, rotatedPath);
this.info(Rotación de log ejecutada: ${path.basename(filePath)});
}
}

/**

Limpieza automática de logs antiguos (Retention)
*/
initRotationCheck() {
setInterval(() => {
fs.readdir(CONFIG.LOG_DIR, (err, files) => {
if (err) return;
const now = Date.now();
files.forEach(file => {
const filePath = path.join(CONFIG.LOG_DIR, file);
const stats = fs.statSync(filePath);
const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

         if (ageDays > CONFIG.RETENTION_DAYS && file.includes('.old')) {
             fs.unlinkSync(filePath);
             this.debug(`Log antiguo eliminado: ${file}`);
         }
     });
 });
}, 1000 * 60 * 60 * 24); // Cada 24 horas
}

/**

Captura global de errores no controlados
*/
captureGlobalErrors() {
process.on('uncaughtException', (err) => {
this.error('CRITICAL: Uncaught Exception', err);
setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
this.error('CRITICAL: Unhandled Rejection', { reason });
});
}

/**

Sanitización de datos sensibles en logs
*/
sanitize(data) {
const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'credit_card'];
const sanitized = { ...data };

Object.keys(sanitized).forEach(key => {
if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
sanitized[key] = '********';
} else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
sanitized[key] = this.sanitize(sanitized[key]);
}
});
return sanitized;
}
}

// --- SINGLETON INSTANCE ---
const logger = new FoxLogger();

// --- EXPORTACIÓN DE FUNCIONES AUXILIARES ---
const log = {
info: (m, c) => logger.info(m, c),
warn: (m, c) => logger.warn(m, c),
error: (m, c) => logger.error(m, c),
debug: (m, c) => logger.debug(m, c),
security: (m, c) => logger.security(m, c),
ai: (i, o, s) => logger.ai(i, o, s),
middleware: () => logger.httpMiddleware(),
track: (l, f) => logger.trackExecution(l, f),
init: () => logger.captureGlobalErrors()
};

/**

AUDITORÍA DE ACCIONES DE USUARIO
*/
const auditUserAction = async (userId, action, details) => {
const message = User Action: ${userId} -> ${action};
logger.info(message, { userId, action, ...details });

// Si es una acción crítica de seguridad, loguear en security.log
const criticalActions = ['login_fail', 'delete_account', 'change_password', 'api_key_gen'];
if (criticalActions.includes(action)) {
logger.security(CRITICAL ACTION: ${action}, { userId, ...details });
}
};

/**

MONITOR DE SALUD DEL SISTEMA
*/
const systemMonitor = () => {
setInterval(() => {
const memory = process.memoryUsage();
const load = os.loadavg();
logger.debug('System Health Metrics', {
rss: ${(memory.rss / 1024 / 1024).toFixed(2)} MB,
heapTotal: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB,
loadAvg: load
});
}, 1000 * 60 * 15); // Cada 15 minutos
};

// Iniciar monitoreo básico
systemMonitor();

module.exports = {
logger: log,
audit: auditUserAction,
FoxLoggerInstance: logger
};

/**

EJEMPLO DE USO EN OTROS ARCHIVOS:

const { logger } = require('./logger');

logger.info('Servidor iniciado en puerto 3000');

logger.error('Fallo en API Groq', new Error('Timeout'));
*/

// Procedimiento de cierre limpio
process.on('SIGTERM', () => {
logger.info('Servidor cerrándose. Finalizando procesos de logging...');
});

// Final del archivo logger.js
// Estructura modular diseñada para alta disponibilidad en Render.
// Jefferson Stivem Mendez - FoxAI Project.
/* Fin del código */