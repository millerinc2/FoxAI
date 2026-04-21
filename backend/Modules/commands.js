 'use strict';

/**
 * FoxAI - Intelligent Conversational Flow Engine v2.0.26
 * Core Logic: User Profiling, Onboarding Orchestration, and Human-Like Adaptation.
 * Structure: backend/Modules/commands.js
 * Author: Jefferson Stivem Mendez
 */

const { logger } = require('./logger');
const { users } = require('./database'); // Conectado a tu lógica de MongoDB

// --- CONFIGURACIÓN DEL FLUJO ---
const FLOW_STEPS = {
    START: 'step_0',
    NAME: 'step_1_name',
    GENDER: 'step_2_gender',
    AGE: 'step_3_age',
    COUNTRY: 'step_4_country',
    RELATIONSHIP: 'step_5_relation',
    TONE: 'step_6_tone',
    CONFIDENCE: 'step_7_confidence',
    COMPLETE: 'step_finished'
};

const activeSessions = new Map();

/**
 * Función Principal: Gestiona el flujo humano inteligente
 */
async function handleUserFlow(userId, message, dbUser = null) {
    logger.info(`Procesando flujo para el usuario: ${userId}`);

    // Si el usuario ya completó el onboarding en la DB, no interceptamos el mensaje
    if (dbUser && dbUser.onboardingComplete) {
        return { isFlow: false, profile: dbUser };
    }

    let session = activeSessions.get(userId) || initializeSession(userId, dbUser);
    const userMessage = message.trim();

    if (userMessage.toLowerCase() === '/reset') {
        return resetFlow(userId);
    }

    switch (session.currentStep) {
        case FLOW_STEPS.START:
            session.currentStep = FLOW_STEPS.NAME;
            activeSessions.set(userId, session);
            return { isFlow: true, response: "¿Cómo te llamas? Me encantaría conocerte." };

        case FLOW_STEPS.NAME:
            return await validateAndSave(userId, session, 'name', userMessage, FLOW_STEPS.GENDER, 
                `¡Mucho gusto, ${userMessage}! Dime, ¿cuál es tu género? (Hombre / Mujer)`);

        case FLOW_STEPS.GENDER:
            const gender = detectGender(userMessage);
            if (!gender) return { isFlow: true, response: "Por favor, dime si eres Hombre o Mujer." };
            return await validateAndSave(userId, session, 'gender', gender, FLOW_STEPS.AGE, 
                "Entendido. ¿Y cuántos años tienes?");

        case FLOW_STEPS.AGE:
            const age = parseInt(userMessage);
            if (isNaN(age) || age < 5 || age > 100) return { isFlow: true, response: "Dime una edad válida en números." };
            return await validateAndSave(userId, session, 'age', age, FLOW_STEPS.COUNTRY, 
                "Perfecto. ¿Desde qué país me escribes?");

        case FLOW_STEPS.COUNTRY:
            return await validateAndSave(userId, session, 'country', userMessage, FLOW_STEPS.RELATIONSHIP, 
                "¡Qué genial! Ahora dime, ¿qué somos? (Amigo, Pareja, Cliente)");

        case FLOW_STEPS.RELATIONSHIP:
            const relation = detectRelation(userMessage);
            if (!relation) return { isFlow: true, response: "Dime si somos Amigos, Pareja o si eres un Cliente." };
            return await validateAndSave(userId, session, 'relationship', relation, FLOW_STEPS.TONE, 
                "Me adapto a ti. ¿Cómo prefieres que hablemos? (Formal, Relajado, Picante)");

        case FLOW_STEPS.TONE:
            const tone = detectTone(userMessage);
            if (!tone) return { isFlow: true, response: "Elige un tono: Formal, Relajado o Picante." };
            return await validateAndSave(userId, session, 'tone', tone, FLOW_STEPS.CONFIDENCE, 
                "¿Qué nivel de confianza tendremos? (Bajo, Medio, Alto)");

        case FLOW_STEPS.CONFIDENCE:
            const confidence = detectConfidence(userMessage);
            if (!confidence) return { isFlow: true, response: "Dime: Bajo, Medio o Alto." };
            return await finalizeOnboarding(userId, session, confidence);

        default:
            return { isFlow: false };
    }
}

function initializeSession(userId, dbUser) {
    const session = {
        userId,
        currentStep: FLOW_STEPS.START,
        data: {
            name: dbUser?.name || null,
            country: dbUser?.country || null,
            relationship: dbUser?.relationship || 'Amigo'
        },
        timestamp: Date.now()
    };
    activeSessions.set(userId, session);
    return session;
}

async function validateAndSave(userId, session, field, value, nextStep, nextQuestion) {
    session.data[field] = value;
    session.currentStep = nextStep;
    session.timestamp = Date.now();
    activeSessions.set(userId, session);

    // Guardado parcial en MongoDB para no perder progreso
    await users.updateUser(userId, { [field]: value });

    return { isFlow: true, response: nextQuestion };
}

async function finalizeOnboarding(userId, session, confidence) {
    const finalProfile = {
        ...session.data,
        confidence: confidence,
        onboardingComplete: true
    };

    await users.updateUser(userId, finalProfile);
    activeSessions.delete(userId);

    return {
        isFlow: true,
        response: `¡Todo listo, ${finalProfile.name}! He configurado mi núcleo para ser tu ${finalProfile.relationship}. ¿En qué puedo ayudarte hoy?`,
        finalProfile
    };
}

// --- DETECTORES ---
function detectGender(msg) {
    const text = msg.toLowerCase();
    if (text.includes('hom') || text.includes('varon')) return 'Hombre';
    if (text.includes('muj') || text.includes('dam')) return 'Mujer';
    return null;
}

function detectRelation(msg) {
    const text = msg.toLowerCase();
    if (text.includes('amig')) return 'Amigo';
    if (text.includes('pareja') || text.includes('novi') || text.includes('amor')) return 'Pareja';
    if (text.includes('cliente')) return 'Cliente';
    return null;
}

function detectTone(msg) {
    const text = msg.toLowerCase();
    if (text.includes('formal')) return 'formal';
    if (text.includes('relajado') || text.includes('normal')) return 'relaxed';
    if (text.includes('picante')) return 'romantic'; // Mapeado a estilo de personality.js
    return null;
}

function detectConfidence(msg) {
    const text = msg.toLowerCase();
    if (text.includes('bajo')) return 'Bajo';
    if (text.includes('medio')) return 'Medio';
    if (text.includes('alto')) return 'Alto';
    return null;
}

function resetFlow(userId) {
    activeSessions.delete(userId);
    return {
        isFlow: true,
        response: "Entendido. He reseteado tu configuración. Vamos a empezar de nuevo: ¿Cómo te llamas?"
    };
}

module.exports = {
    handleUserFlow,
    resetFlow,
    FLOW_STEPS
};

// Limpieza de sesiones inactivas
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of activeSessions.entries()) {
        if (now - session.timestamp > 1000 * 60 * 30) activeSessions.delete(userId);
    }
}, 1000 * 60 * 10);