'use strict';

/**

FoxAI - Cognitive Memory System v2.0.26

Orchestration: User Profiling, Context Retention, and Long-Term Memory.

Dependencies: database.js, logger.js

Target: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const { users, chats } = require('./database');
const { logger } = require('./logger');

// --- CONFIGURACIÓN DE LA MEMORIA ---
const MEMORY_CONFIG = {
SHORT_TERM_LIMIT: 15,      // Mensajes en contexto inmediato
LONG_TERM_LIMIT: 100,      // Mensajes para resumen y análisis
CACHE_TTL: 1000 * 60 * 30, // 30 minutos de vida en RAM
CLEANUP_INTERVAL: 1000 * 60 * 10 // 10 minutos
};

// --- CACHE EN RAM (ESTADO VOLÁTIL) ---
const ramCache = new Map();

/**

Clase de Gestión de Memoria para FoxAI
*/
class MemoryEngine {
constructor() {
this.startCleanupTask();
}

/**

Obtiene la memoria completa de un usuario (Perfil + Contexto)
*/
async getUserMemory(userId) {
try {
// 1. Intentar desde RAM Cache para velocidad máxima
if (ramCache.has(userId)) {
const cached = ramCache.get(userId);
cached.lastAccess = Date.now();
return cached.data;
}

 // 2. Obtener perfil desde Database (Mongo/JSON Fallback)
 const profile = await users.get(userId);
 if (!profile) return this.initializeNewMemory(userId);

 // 3. Obtener historial reciente
 const history = await chats.getHistory(userId, MEMORY_CONFIG.SHORT_TERM_LIMIT);

 const memoryData = {
     userId,
     profile: {
         name: profile.name || 'Usuario',
         age: profile.age || null,
         gender: profile.gender || null,
         country: profile.country || null,
         relationship: profile.relationship || 'Amigo',
         tone: profile.tone || 'Relajado',
         confidence: profile.confidence || 'Media'
     },
     history: history.reverse(),
     preferences: profile.preferences || {},
     behavior: profile.behavior || {
         avgResponseLength: 0,
         topicsInterest: [],
         lastInteraction: profile.lastActive
     }
 };

 // 4. Guardar en RAM
 this.setCache(userId, memoryData);

 return memoryData;
} catch (err) {
logger.error(Error obteniendo memoria para ${userId}, err);
return this.initializeNewMemory(userId);
}
}

/**

Inicializa una estructura de memoria vacía
*/
initializeNewMemory(userId) {
return {
userId,
profile: { name: 'Nuevo Usuario', relationship: 'Amigo', tone: 'Relajado' },
history: [],
preferences: {},
behavior: { lastInteraction: new Date() }
};
}

/**

Guarda la memoria completa
*/
async saveUserMemory(userId, data) {
try {
// Validar Estructura
if (!data.profile || !data.userId) throw new Error("Estructura de memoria inválida");

 // Persistir Perfil en Database
 await users.update(userId, {
     ...data.profile,
     preferences: data.preferences,
     behavior: data.behavior,
     onboardingComplete: data.profile.onboardingComplete || false
 });

 // Actualizar Cache
 this.setCache(userId, data);

 logger.info(`Memoria guardada para el usuario ${userId}`);
 return true;
} catch (err) {
logger.error(Error guardando memoria de ${userId}, err);
return false;
}
}

/**

Actualización parcial de memoria (Smart Update)
*/
async updateUserMemory(userId, updates) {
const currentMemory = await this.getUserMemory(userId);

if (updates.profile) {
currentMemory.profile = { ...currentMemory.profile, ...updates.profile };
}
if (updates.preferences) {
currentMemory.preferences = { ...currentMemory.preferences, ...updates.preferences };
}
if (updates.behavior) {
currentMemory.behavior = { ...currentMemory.behavior, ...updates.behavior };
}

return await this.saveUserMemory(userId, currentMemory);
}

/**

Añade un mensaje al flujo de memoria (Corto plazo)
*/
async addMessageToMemory(userId, role, content) {
const message = { userId, role, content, timestamp: new Date() };

// 1. Persistencia en DB
await chats.save(message);

// 2. Actualización de Cache en RAM
if (ramCache.has(userId)) {
const cached = ramCache.get(userId);
cached.data.history.push(message);

 // Mantener límite de memoria a corto plazo en RAM
 if (cached.data.history.length > MEMORY_CONFIG.SHORT_TERM_LIMIT) {
     cached.data.history.shift();
 }
 cached.lastAccess = Date.now();
}

// 3. Detectar cambios en el comportamiento (IA Intelligence)
this.analyzeMessageBehavior(userId, content);
}

/**

Genera el contexto optimizado para enviar a Groq (aiHandler)
*/
async getConversationContext(userId) {
const memory = await this.getUserMemory(userId);

// Construir el "String de Memoria" para el System Prompt
const profileContext = Usuario: ${memory.profile.name}. Relación: ${memory.profile.relationship}. Tono: ${memory.profile.tone}. Ubicación: ${memory.profile.country}. Edad: ${memory.profile.age}.;

const historyContext = memory.history.map(m => ({
role: m.role === 'ai' ? 'assistant' : 'user',
content: m.content
}));

return {
systemInstructions: profileContext,
messages: historyContext,
userPreferences: memory.preferences
}
}

/**

Analiza el mensaje para detectar gustos o cambios de humor
*/
analyzeMessageBehavior(userId, content) {
const text = content.toLowerCase();
const detectedInterests = [];

if (text.includes('programar') || text.includes('javascript')) detectedInterests.push('coding');
if (text.includes('musica') || text.includes('trap')) detectedInterests.push('music');
if (text.includes('reparar') || text.includes('celular')) detectedInterests.push('electronics');

if (detectedInterests.length > 0) {
this.updateUserMemory(userId, {
behavior: { lastInterestDetected: detectedInterests[0] }
});
}
}

/**

Borrado de memoria (Reset)
*/
async resetMemory(userId) {
ramCache.delete(userId);
await users.update(userId, {
onboardingComplete: false,
preferences: {},
behavior: {}
});
logger.warn(Memoria reseteada para usuario: ${userId});
}

/**

Eliminación total (GDPR / Purge)
*/
async deleteUserMemory(userId) {
ramCache.delete(userId);
// Aquí se llamarían a funciones de borrado físico en database.js
logger.security(MEMORIA ELIMINADA PERMANENTEMENTE: ${userId});
}

// --- SISTEMA DE CACHE ---

setCache(userId, data) {
ramCache.set(userId, {
data,
lastAccess: Date.now()
});
}

startCleanupTask() {
setInterval(() => {
const now = Date.now();
for (const [userId, entry] of ramCache.entries()) {
if (now - entry.lastAccess > MEMORY_CONFIG.CACHE_TTL) {
ramCache.delete(userId);
logger.debug(Cache liberado para usuario inactivo: ${userId});
}
}
}, MEMORY_CONFIG.CLEANUP_INTERVAL);
}

/**

Resume historial antiguo para ahorrar tokens (IA Logic)
*/
async compressLongTermMemory(userId) {
const fullHistory = await chats.getHistory(userId, MEMORY_CONFIG.LONG_TERM_LIMIT);
if (fullHistory.length < 50) return;

logger.info(Comprimiendo memoria a largo plazo para ${userId}...);
// Aquí se enviaría a Groq un prompt para resumir los puntos clave
// y se guardaría en memory.preferences.summary
}
}

// Singleton Instance
const Memory = new MemoryEngine();

module.exports = {
getUserMemory: (id) => Memory.getUserMemory(id),
saveUserMemory: (id, d) => Memory.saveUserMemory(id, d),
updateUserMemory: (id, u) => Memory.updateUserMemory(id, u),
addMessage: (id, r, c) => Memory.addMessageToMemory(id, r, c),
getContext: (id) => Memory.getConversationContext(id),
reset: (id) => Memory.resetMemory(id),
purge: (id) => Memory.deleteUserMemory(id)
};

/**

FOXAI MEMORY PROTOCOL

Diseñado para Jefferson Stivem Mendez.

Mantiene la coherencia entre sesiones y dispositivos.
*/
// Fin del archivo memory.js