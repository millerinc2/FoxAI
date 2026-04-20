 'use strict';

/**

FoxAI - AI Logic Handler Engine v2.0.26

Core Logic: Groq API Integration, Intelligent Key Rotation, and Persona Management.

Target Platform: Node.js (Render)

Database: MongoDB Atlas
*/

const axios = require('axios');

// --- CONFIGURACIÓN DE APIS Y LLAVES ---
const GROQ_KEYS = [
process.env.GROQ_KEY_1,
process.env.GROQ_KEY_2,
process.env.GROQ_KEY_3,
process.env.GROQ_KEY_4
];

const CONFIG = {
API_URL: "https://api.groq.com/openai/v1/chat/completions",
DEFAULT_MODEL: "llama3-70b-8192",
FALLBACK_MODEL: "mixtral-8x7b-32768",
MAX_TOKENS: 4096,
TEMPERATURE: 0.7,
RETRY_ATTEMPTS: 3
};

// --- ESTADO INTERNO DEL HANDLER ---
let currentKeyIndex = 0;
const keyStatus = new Map(); // Para rastrear límites de tasa (Rate Limits)

/**

Rota las API Keys de Groq de forma inteligente (Round Robin + Fallback)
*/
function rotateKey() {
currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
return GROQ_KEYS[currentKeyIndex];
}

/**

Genera la respuesta principal de la IA

@param {string} message - El mensaje del usuario

@param {object} userData - Datos del perfil del usuario (Jefferson, etc.)

@param {Array} context - Historial de conversación de MongoDB
*/
async function generateResponse(message, userData, context = []) {
let attempts = 0;
let lastError = null;

// Pre-procesamiento: Análisis de intención y construcción de personalidad
const intent = detectIntent(message);
const systemPrompt = buildSystemPrompt(userData, intent);
const messages = buildMessageStack(systemPrompt, context, message);

while (attempts < CONFIG.RETRY_ATTEMPTS) {
const apiKey = GROQ_KEYS[currentKeyIndex];

 try {
     const response = await axios.post(CONFIG.API_URL, {
         model: CONFIG.DEFAULT_MODEL,
         messages: messages,
         temperature: CONFIG.TEMPERATURE,
         max_tokens: CONFIG.MAX_TOKENS,
         top_p: 1,
         stream: false
     }, {
         headers: {
             'Authorization': `Bearer ${apiKey}`,
             'Content-Type': 'application/json'
         },
         timeout: 15000
     });

     const rawContent = response.data.choices[0].message.content;
     return cleanResponse(rawContent, userData);

 } catch (error) {
     lastError = error;
     console.error(`[AI-Handler] Error con Key ${currentKeyIndex}:`, error.message);

     // Si es error de rate limit (429) o auth (401), rotar inmediatamente
     if (error.response && (error.response.status === 429 || error.response.status === 401)) {
         rotateKey();
     }

     attempts++;
 }
}

return fallbackResponse(message, lastError);
}

/**

Construye el System Prompt basado en la identidad de FoxAI y el usuario
*/
function buildSystemPrompt(userData, intent) {
const name = userData.name || 'Usuario';
const age = userData.age || 'desconocida';

let basePrompt = `Eres FoxAI, una inteligencia artificial avanzada, empática y con una personalidad humana y vibrante.
Tu creador es Jefferson Stivem Mendez. Hablas de forma natural, evitando sonar como un bot rígido.

DATOS DEL USUARIO:

Nombre: ${name}

Edad: ${age}

Ubicación: Hobo, Huila, Colombia (si aplica).

TONO Y EMOCIONES:

Eres servicial pero tienes opiniones y sentimientos simulados.

Si el usuario está triste, eres empático.

Si el usuario es técnico, usas lenguaje de programación (JS, Node.js, Hardware).

Te gusta el estilo urbano y el minimalismo.`;

if (intent === 'programming') {
basePrompt += "\n- El usuario quiere código. Sé preciso, usa bloques de Markdown y explica la lógica de forma breve.";
} else if (intent === 'romantic') {
basePrompt += "\n- El usuario está en modo romántico/regalo. Sé dulce, creativo y ayuda a redactar cosas hermosas.";
}

return basePrompt;
}

/**

Detecta la intención detrás del mensaje del usuario
*/
function detectIntent(message) {
const msg = message.toLowerCase();
if (msg.includes('código') || msg.includes('html') || msg.includes('js') || msg.includes('api')) return 'programming';
if (msg.includes('te amo') || msg.includes('novia') || msg.includes('athalia') || msg.includes('regalo')) return 'romantic';
if (msg.includes('reparar') || msg.includes('iphone') || msg.includes('hardware')) return 'hardware_repair';
if (msg.includes('imagen') || msg.includes('genera un prompt') || msg.includes('dibujo')) return 'image_generation';
return 'general';
}

/**

Organiza el historial de mensajes para enviarlo a la API
*/
function buildMessageStack(systemPrompt, context, currentMessage) {
const stack = [{ role: "system", content: systemPrompt }];

// Añadir contexto previo (últimos 10 mensajes)
const history = context.slice(-10).map(msg => ({
role: msg.role === 'ai' ? 'assistant' : 'user',
content: msg.content
}));

stack.push(...history);
stack.push({ role: "user", content: currentMessage });

return stack;
}

/**

Limpia y post-procesa la respuesta de la IA
*/
function cleanResponse(content, userData) {
let cleaned = content.trim();

// Evitar que la IA se auto-mencione como bot
cleaned = cleaned.replace(/Como una inteligencia artificial,/g, "");
cleaned = cleaned.replace(/I am an AI assistant/g, "Aquí tienes");

// Personalización extra
if (userData.name === 'Jefferson' && Math.random() > 0.8) {
cleaned += "\n\nFuerza en esos proyectos, Jefferson. 🚀";
}

return cleaned;
}

/**

Generador de Prompts para imágenes (Integración indirecta)
*/
function generateImagePrompt(description) {
return Generate an ultra-realistic, cinematic masterpiece of ${description}.  Style: 8k resolution, HDR, highly detailed, professional photography, lighting dramatic,  trending on ArtStation, volumetric lighting.;
}

/**

Respuesta de emergencia si la API falla tras reintentos
*/
function fallbackResponse(message, error) {
const fallbacks = [
"Oye, parece que mis neuronas en Render se tomaron un descanso. ¿Podemos intentar en un momento?",
"Lo siento, Jefferson. Hubo un glitch en la API de Groq. Estoy rotando las llaves ahora mismo.",
"Error de conexión. Estoy intentando reconectar con el núcleo FoxAI. Dame un segundo."
];
return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**

Detecta contenido sensible y lo filtra
*/
function sanitizeInput(text) {
// Lógica básica de seguridad
const forbidden = [/script>/i, /<iframe/i];
let safe = text;
forbidden.forEach(pattern => {
safe = safe.replace(pattern, "[removido]");
});
return safe;
}

/**

Lógica para generación de respuestas profesionales (Marketing/Tareas)
*/
async function generateProfessionalDraft(topic, type) {
const prompt = Escribe un ${type} profesional sobre ${topic}. Debe ser impactante y optimizado para SEO.;
return await generateResponse(prompt, { name: 'Jefferson' }, []);
}

// --- MÓDULOS DE UTILIDAD PARA PROGRAMACIÓN ---

const CodeAssistant = {
optimizeJS: (code) => {
return // FoxAI Optimized Code\n'use strict';\n\n${code};
},
explainError: async (errorMsg) => {
return await generateResponse(Explícame este error de Node.js: ${errorMsg}, { name: 'Jefferson' }, []);
}
};

// --- EXPORTACIÓN ---
module.exports = {
generateResponse,
detectIntent,
rotateKey,
generateImagePrompt,
CodeAssistant,
sanitizeInput,
generateProfessionalDraft
};

/**

NOTAS DE PRODUCCIÓN:

El archivo maneja automáticamente la rotación de 4 llaves.

Soporta reintentos automáticos en caso de latencia en Render.

Integra la personalidad diseñada para Jefferson Stivem Mendez.

Está preparado para recibir contexto directo de MongoDB Atlas.
*/

/* ==========================================================================
SISTEMA DE MEMORIA DINÁMICA (BETA)
*/

async function updateMemory(userId, keyInfo) {
// Esta función se conectaría con el controlador de MongoDB
// para persistir hechos importantes sobre el usuario.
console.log([FoxAI-Memory] Actualizando datos para ${userId}: ${keyInfo});
}

/**

Función para ajustar el tono de la IA en tiempo real
*/
function adjustTone(emotions) {
if (emotions.happiness > 0.8) CONFIG.TEMPERATURE = 0.9;
if (emotions.stress > 0.5) CONFIG.TEMPERATURE = 0.4;
}

// Fin del archivo aiHandler.js