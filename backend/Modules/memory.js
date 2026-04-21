 'use strict';

/**
 * FoxAI - Cognitive Memory System v2.0.26
 * Orchestration: User Profiling, Context Retention, and Long-Term Memory.
 * Structure: backend/Modules/memory.js
 * Author: Jefferson Stivem Mendez
 */

// Importaciones corregidas para la carpeta Modules
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
 * Clase de Gestión de Memoria para FoxAI
 */
class MemoryEngine {
    constructor() {
        this.startCleanupTask();
    }

    /**
     * Obtiene la memoria completa de un usuario (Perfil + Contexto)
     */
    async getUserMemory(userId) {
        try {
            // 1. Intentar desde RAM Cache para velocidad máxima
            if (ramCache.has(userId)) {
                const cached = ramCache.get(userId);
                cached.lastAccess = Date.now();
                return cached.data;
            }

            // 2. Obtener perfil desde Database
            const profile = await users.getOrCreateUser(userId);

            // 3. Obtener historial reciente
            const history = await users.getChatHistory(userId, MEMORY_CONFIG.SHORT_TERM_LIMIT);

            const memoryData = {
                userId,
                profile: {
                    name: profile.name || 'Usuario',
                    age: profile.age || 18,
                    country: profile.country || 'Colombia',
                    relationship: profile.relationship || 'Amigo',
                    tone: profile.tone || 'relaxed',
                    confidence: profile.confidence || 'Media'
                },
                history: history,
                preferences: profile.metadata || {},
                behavior: {
                    lastInteraction: profile.lastInteraction || new Date()
                }
            };

            // 4. Guardar en RAM
            this.setCache(userId, memoryData);
            return memoryData;
        } catch (err) {
            logger.error(`Error obteniendo memoria para ${userId}: ${err.message}`);
            return this.initializeNewMemory(userId);
        }
    }

    initializeNewMemory(userId) {
        return {
            userId,
            profile: { name: 'Nuevo Usuario', relationship: 'Amigo', tone: 'relaxed', country: 'Colombia' },
            history: [],
            preferences: {},
            behavior: { lastInteraction: new Date() }
        };
    }

    async saveUserMemory(userId, data) {
        try {
            if (!data.profile || !data.userId) throw new Error("Estructura de memoria inválida");

            // Persistir Perfil en Database (Usando la lógica de database.js)
            await users.updateUser(userId, {
                ...data.profile,
                metadata: data.preferences,
                lastInteraction: Date.now()
            });

            // Actualizar Cache
            this.setCache(userId, data);
            logger.info(`Memoria guardada para el usuario ${userId}`);
            return true;
        } catch (err) {
            logger.error(`Error guardando memoria de ${userId}: ${err.message}`);
            return false;
        }
    }

    async addMessageToMemory(userId, role, content) {
        try {
            // 1. Persistencia en DB
            await users.saveMessage(userId, role, content);

            // 2. Actualización de Cache en RAM
            if (ramCache.has(userId)) {
                const cached = ramCache.get(userId);
                cached.data.history.push({ role, content, timestamp: new Date() });

                if (cached.data.history.length > MEMORY_CONFIG.SHORT_TERM_LIMIT) {
                    cached.data.history.shift();
                }
                cached.lastAccess = Date.now();
            }
        } catch (err) {
            logger.error(`Error al añadir mensaje a memoria: ${err.message}`);
        }
    }

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
                    logger.info(`Cache liberado para usuario inactivo: ${userId}`);
                }
            }
        }, MEMORY_CONFIG.CLEANUP_INTERVAL);
    }
}

// Singleton Instance
const Memory = new MemoryEngine();

module.exports = {
    getUserMemory: (id) => Memory.getUserMemory(id),
    saveUserMemory: (id, d) => Memory.saveUserMemory(id, d),
    addMessage: (id, r, c) => Memory.addMessageToMemory(id, r, c),
    reset: (id) => Memory.initializeNewMemory(id)
};