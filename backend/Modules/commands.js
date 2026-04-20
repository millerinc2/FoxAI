'use strict';

/**

FoxAI - Intelligent Conversational Flow Engine v2.0.26

Core Logic: User Profiling, Onboarding Orchestration, and Human-Like Adaptation.

Target Platform: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const { logger } = require('./logger');
const aiHandler = require('./aiHandler');

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

// --- MEMORIA TEMPORAL (SESIÓN ACTIVA) ---
const activeSessions = new Map();

/**

Función Principal: Gestiona el flujo humano inteligente
*/
async function handleUserFlow(userId, message, dbUser = null) {
logger.info(Procesando flujo para el usuario: ${userId});

// Si el usuario ya está completamente registrado, saltamos el flujo de comandos
if (dbUser && dbUser.onboardingComplete) {
return { isFlow: false, profile: dbUser };
}

// Obtener o inicializar sesión temporal
let session = activeSessions.get(userId) || initializeSession(userId, dbUser);
const userMessage = message.trim();

// Lógica de comandos directos para resetear o forzar
if (userMessage.toLowerCase() === '/reset') {
return resetFlow(userId);
}

// Procesar respuesta según el paso actual
switch (session.currentStep) {
case FLOW_STEPS.START:
return await processStep(userId, session, FLOW_STEPS.NAME, "¿Cómo te llamas? Me encantaría conocerte.");

 case FLOW_STEPS.NAME:
     return await validateAndSave(userId, session, 'name', userMessage, FLOW_STEPS.GENDER, 
         `¡Mucho gusto, ${userMessage}! Dime, ¿cuál es tu género? (Hombre / Mujer)`);

 case FLOW_STEPS.GENDER:
     const gender = detectGender(userMessage);
     if (!gender) return { isFlow: true, response: "Por favor, selecciona una opción válida: Hombre o Mujer." };
     return await validateAndSave(userId, session, 'gender', gender, FLOW_STEPS.AGE, 
         "Entendido. ¿Y cuántos años tienes?");

 case FLOW_STEPS.AGE:
     const age = parseInt(userMessage);
     if (isNaN(age) || age < 5 || age > 100) return { isFlow: true, response: "Dime una edad válida en números, por favor." };
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

/**

Inicializa la estructura de la sesión
*/
function initializeSession(userId, dbUser) {
const session = {
userId,
currentStep: dbUser ? (dbUser.lastStep || FLOW_STEPS.START) : FLOW_STEPS.START,
data: {
name: dbUser?.name || null,
gender: dbUser?.gender || null,
age: dbUser?.age || null,
country: dbUser?.country || null,
relationship: dbUser?.relationship || null,
tone: dbUser?.tone || null,
confidence: dbUser?.confidence || null
},
timestamp: Date.now()
};
activeSessions.set(userId, session);
return session;
}

/**

Procesa el paso, guarda datos y prepara la siguiente pregunta
*/
async function validateAndSave(userId, session, field, value, nextStep, nextQuestion) {
session.data[field] = value;
session.currentStep = nextStep;
activeSessions.set(userId, session);

// Guardado persistente parcial (Optimización para Render/MongoDB)
await persistProgress(userId, session);

return {
isFlow: true,
response: nextQuestion,
progress: calculateProgress(nextStep)
};
}

/**

Finaliza el proceso de perfilado
*/
async function finalizeOnboarding(userId, session, confidence) {
session.data.confidence = confidence;
session.currentStep = FLOW_STEPS.COMPLETE;
session.onboardingComplete = true;

const finalProfile = {
...session.data,
onboardingComplete: true,
updatedAt: new Date()
};

activeSessions.delete(userId); // Limpiamos memoria temporal
await saveToMongoDB(userId, finalProfile);

const welcomeMsg = ¡Todo listo, ${finalProfile.name}! He configurado mi núcleo para ser tu ${finalProfile.relationship} con un tono ${finalProfile.tone}. ¿En qué puedo ayudarte hoy?;

return {
isFlow: true,
response: welcomeMsg,
finalProfile
};
}

// --- UTILIDADES DE DETECCIÓN INTELIGENTE ---

function detectGender(msg) {
const text = msg.toLowerCase();
if (text.includes('hombre') || text.includes('varon') || text === 'm') return 'Hombre';
if (text.includes('mujer') || text.includes('dama') || text === 'f') return 'Mujer';
return null;
}

function detectRelation(msg) {
const text = msg.toLowerCase();
if (text.includes('amig')) return 'Amigo';
if (text.includes('pareja') || text.includes('novi') || text.includes('amor')) return 'Pareja';
if (text.includes('cliente') || text.includes('trabajo') || text.includes('user')) return 'Cliente';
return null;
}

function detectTone(msg) {
const text = msg.toLowerCase();
if (text.includes('formal') || text.includes('serio')) return 'Formal';
if (text.includes('relajado') || text.includes('normal') || text.includes('tranqui')) return 'Relajado';
if (text.includes('picante') || text.includes('atrevido') || text.includes('hot')) return 'Picante';
return null;
}

function detectConfidence(msg) {
const text = msg.toLowerCase();
if (text.includes('bajo')) return 'Bajo';
if (text.includes('medio')) return 'Medio';
if (text.includes('alto')) return 'Alto';
return null;
}

function calculateProgress(step) {
const total = Object.keys(FLOW_STEPS).length - 1;
const current = Object.values(FLOW_STEPS).indexOf(step);
return Math.round((current / total) * 100);
}

// --- PERSISTENCIA (BACKEND MOCK/API) ---

async function persistProgress(userId, session) {
// Aquí se conectaría con tu controlador de MongoDB
logger.info(Progreso persistido para ${userId} en ${session.currentStep});
}

async function saveToMongoDB(userId, profile) {
// Simulación de guardado final en Atlas
logger.info(Perfil completo guardado en MongoDB para ${userId}, profile);
}

function resetFlow(userId) {
activeSessions.delete(userId);
return {
isFlow: true,
response: "Entendido. He reseteado tu configuración. Vamos a empezar de nuevo: ¿Cómo te llamas?",
currentStep: FLOW_STEPS.NAME
};
}

/**

Obtiene el prompt dinámico basado en el perfil construido
*/
function getInstructionForAI(profile) {
if (!profile) return "Eres FoxAI, una IA amigable.";

return Eres FoxAI. Te diriges a ${profile.name}, quien es tu ${profile.relationship}.  Tu tono debe ser ${profile.tone} con un nivel de confianza ${profile.confidence}.  Él/Ella tiene ${profile.age} años y vive en ${profile.country}.;
}

// --- EXPORTACIÓN ---
module.exports = {
handleUserFlow,
getInstructionForAI,
resetFlow,
FLOW_STEPS
};

/**

LOGICA DE REANUDACIÓN

Permite que si el servidor se reinicia, el usuario no pierda el paso.
*/
async function recoverSession(userId, dbUser) {
if (dbUser && !dbUser.onboardingComplete) {
return initializeSession(userId, dbUser);
}
return null;
}

/**

AUTO-CLEANUP DE SESIONES

Evita fugas de memoria en Render
*/
setInterval(() => {
const now = Date.now();
for (const [userId, session] of activeSessions.entries()) {
if (now - session.timestamp > 1000 * 60 * 30) { // 30 min inactividad
activeSessions.delete(userId);
logger.debug(Sesión inactiva eliminada: ${userId});
}
}
}, 1000 * 60 * 10);

// Fin del archivo commands.js
// Total funcionalidad: Onboarding, Validación, Estados y Perfilado.
// Jefferson Stivem Mendez - FoxAI Internal Protocol.