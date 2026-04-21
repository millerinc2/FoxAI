 'use strict';

/**
 * FoxAI - WhatsApp Flow Management System v2.0.26
 * Orchestration: Interactive Menu, State Machine, and Advisor Transfer.
 * Structure: backend/Modules/whatsappFlow.js
 * Author: Jefferson Stivem Mendez
 */

const { logger } = require('./logger');
const { users } = require('./database'); // Importación corregida para persistencia
const { addMessage } = require('./memory'); // Importación corregida
const { assignAdvisor, getMenu, getResponse } = require('./advisors');

// --- CONSTANTES DE ESTADO ---
const STATES = {
    IDLE: 'STATE_IDLE',
    MENU: 'STATE_MENU',
    SUPPORT: 'STATE_SUPPORT',
    COMPLAINTS: 'STATE_COMPLAINTS',
    MEMBERSHIP: 'STATE_MEMBERSHIP',
    ADVISOR: 'STATE_ADVISOR_TALK',
    WAITING: 'STATE_WAITING_QUEUE'
};

// --- CACHE DE ESTADOS EN TIEMPO REAL ---
const userStates = new Map();

/**
 * Función Principal: Entrada de mensajes desde Webhook de WhatsApp
 */
async function handleIncomingMessage(userId, message, whatsappClient = null) {
    try {
        const text = message.trim().toLowerCase();
        let session = await getOrInitSession(userId);

        logger.info(`Mensaje de WhatsApp [${userId}]: ${text} | Estado: ${session.state}`);

        // 1. Detección de comandos globales
        if (text === 'menu' || text === 'inicio' || text === 'salir') {
            return await resetFlow(userId, whatsappClient);
        }

        // 2. Procesamiento según Máquina de Estados
        switch (session.state) {
            case STATES.IDLE:
            case STATES.MENU:
                return await processMenuSelection(userId, text, whatsappClient);

            case STATES.ADVISOR:
                return await processAdvisorConversation(userId, text, whatsappClient);

            case STATES.SUPPORT:
            case STATES.COMPLAINTS:
            case STATES.MEMBERSHIP:
                return await processTopicFlow(userId, text, session.state, whatsappClient);

            default:
                return await sendMenu(userId, whatsappClient);
        }
    } catch (err) {
        logger.error(`Fallo en handleIncomingMessage para ${userId}: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Inicializa o recupera la sesión del usuario
 */
async function getOrInitSession(userId) {
    if (userStates.has(userId)) return userStates.get(userId);

    const dbUser = await users.getOrCreateUser(userId);
    const session = {
        userId,
        state: dbUser?.flowState || STATES.IDLE,
        lastInteraction: Date.now(),
        advisorId: dbUser?.assignedAdvisorId || null
    };

    userStates.set(userId, session);
    return session;
}

/**
 * Procesa la selección del menú inicial
 */
async function processMenuSelection(userId, text, client) {
    if (text === '1' || text.includes('soporte')) {
        return await setAndNotify(userId, STATES.SUPPORT, "Has seleccionado Soporte Técnico. Cuéntanos tu problema detalladamente.", client);
    }
    else if (text === '2' || text.includes('queja') || text.includes('reclamo')) {
        return await setAndNotify(userId, STATES.COMPLAINTS, "Lamentamos los inconvenientes. Por favor, describe tu Queja o Reclamo.", client);
    }
    else if (text === '3' || text.includes('membresia')) {
        return await setAndNotify(userId, STATES.MEMBERSHIP, "Bienvenido al área de Membresías. ¿En qué podemos ayudarte con tu suscripción?", client);
    }
    else if (text === '4' || text.includes('asesor') || text.includes('humano')) {
        return await connectToAdvisor(userId, client);
    }
    else {
        return await sendMenu(userId, client);
    }
}

/**
 * Envía el menú principal con simulación de escritura
 */
async function sendMenu(userId, client) {
    const menu = getMenu();
    await simulateTyping(userId, client, 1500);

    await setUserState(userId, STATES.MENU);

    if (client) {
        await client.sendMessage(userId, { text: menu });
    }

    return { success: true, response: menu };
}

/**
 * Transferencia a Asesor (Advisors.js)
 */
async function connectToAdvisor(userId, client) {
    await simulateTyping(userId, client, 2000);

    const notification = "⌛ Te estamos conectando con un asesor disponible de FoxAI. Por favor, espera un momento...";
    if (client) await client.sendMessage(userId, { text: notification });

    const advisor = await assignAdvisor(userId);
    await setUserState(userId, STATES.ADVISOR);

    const welcomeMsg = `✅ *Conexión establecida.*\n\nHola, mi nombre es *${advisor.name}*, asesor de FoxAI en ${advisor.country}. ¿Cómo puedo ayudarte hoy?`;

    await simulateTyping(userId, client, 3000);
    if (client) await client.sendMessage(userId, { text: welcomeMsg });

    return { success: true, advisor };
}

/**
 * Procesa la conversación activa con el asesor simulado
 */
async function processAdvisorConversation(userId, text, client) {
    await addMessage(userId, 'user', text);
    await simulateTyping(userId, client, 2500);

    const responseData = await getResponse(userId, text);
    await addMessage(userId, 'ai', responseData.text);

    if (client) {
        await client.sendMessage(userId, { text: responseData.text });
    }

    return { success: true, response: responseData.text };
}

/**
 * Flujos específicos de temas (Soporte, Quejas, etc.)
 */
async function processTopicFlow(userId, text, currentState, client) {
    if (text.length < 5) {
        const msg = "Por favor, danos más detalles para poder ayudarte mejor.";
        if (client) await client.sendMessage(userId, { text: msg });
        return { success: true, response: msg };
    }

    const msg = "Entiendo. ¿Deseas que te transfiera con un asesor especialista para resolver esto? (Escribe SI para transferir o MENU para volver)";
    
    if (text.includes('si')) {
        return await connectToAdvisor(userId, client);
    }

    if (client) await client.sendMessage(userId, { text: msg });
    return { success: true, response: msg };
}

/**
 * Resetear flujo (Limpieza)
 */
async function resetFlow(userId, client) {
    userStates.delete(userId);
    await users.updateUser(userId, { flowState: STATES.IDLE, assignedAdvisorId: null });

    const msg = "🔄 Flujo reiniciado.";
    if (client) await client.sendMessage(userId, { text: msg });

    return await sendMenu(userId, client);
}

/**
 * Helpers de Gestión de Estado
 */
async function setUserState(userId, state) {
    const session = await getOrInitSession(userId);
    session.state = state;
    userStates.set(userId, session);

    // Persistencia corregida en MongoDB
    await users.updateUser(userId, { flowState: state });
}

async function setAndNotify(userId, state, message, client) {
    await setUserState(userId, state);
    if (client) {
        await simulateTyping(userId, client, 1000);
        await client.sendMessage(userId, { text: message });
    }
    return { success: true, response: message };
}

/**
 * Simulación de Interacción Humana (WhatsApp "composing...")
 */
async function simulateTyping(userId, client, duration = 2000) {
    if (!client) return;
    try {
        await client.sendPresenceUpdate('composing', userId);
        await new Promise(res => setTimeout(res, duration));
        await client.sendPresenceUpdate('paused', userId);
    } catch (e) {
        logger.error("Error simulando typing", e);
    }
}

/**
 * Exportación del Módulo de Flujo
 */
module.exports = {
    handleIncomingMessage,
    resetFlow,
    setUserState,
    sendMenu,
    connectToAdvisor,
    STATES
};