use strict';

/**

FoxAI - Image Generation Engine (Nano Banana 2 Style)

Logic: Using Pollinations.ai for Unlimited & Free High-Quality Generations.

Target: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const axios = require('axios');
const { logger } = require('./logger');

// --- CONFIGURACIÓN DE MOTOR ---
const CONFIG = {
BASE_URL: "https://image.pollinations.ai/prompt/",
SETTINGS: {
WIDTH: 1024,
HEIGHT: 1024,
MODELS: ['flux', 'turbo', 'art'],
ENHANCE: true,
NO_LOGO: true
}
};

/**

Función Principal: Genera la URL de la imagen.

Esta URL se puede enviar directamente al frontend o descargar.
*/
async function generateImage(userRequest, options = {}) {
try {
logger.info(Solicitud de imagen recibida: ${userRequest});

 // 1. Ingeniería de Prompt (Simulación de Nano Banana 2)
 // Convertimos un prompt simple en uno profesional automáticamente.
 const professionalPrompt = buildProfessionalPrompt(userRequest, options.style || 'cinematic');

 // 2. Parámetros Aleatorios para Variedad
 const seed = Math.floor(Math.random() * 1000000);
 const model = options.model || 'flux'; // Flux es el más cercano a Nano Banana 2

 // 3. Construcción de URL Dinámica
 // Estructura: BASE_URL/{PROMPT}?width={W}&height={H}&seed={S}&model={M}&nologo=true
 const encodedPrompt = encodeURIComponent(professionalPrompt);
 const finalUrl = `${CONFIG.BASE_URL}${encodedPrompt}?width=${CONFIG.SETTINGS.WIDTH}&height=${CONFIG.SETTINGS.HEIGHT}&seed=${seed}&model=${model}&nologo=${CONFIG.SETTINGS.NO_LOGO}&enhance=${CONFIG.SETTINGS.ENHANCE}`;

 logger.info(`Imagen generada con éxito: ${finalUrl}`);

 return {
     success: true,
     url: finalUrl,
     metadata: {
         prompt_used: professionalPrompt,
         seed: seed,
         model: model,
         engine: "Pollinations-Flux-v1"
     }
 };
} catch (error) {
logger.error("Fallo en el motor de imagen", error);
return {
success: false,
message: "No pude visualizar la imagen. Intenta de nuevo.",
error: error.message
};
}
}

/**

buildProfessionalPrompt: El "Cerebro" Estético.

Agrega modificadores de alta gama para igualar la calidad de Gemini.
*/
function buildProfessionalPrompt(text, style) {
// Limpiamos el texto de comandos comunes
let prompt = text.toLowerCase()
.replace(/genera una imagen de/g, '')
.replace(/dibuja/g, '')
.replace(/haz una foto de/g, '')
.trim();

// Modificadores de Calidad (Nano Banana Style)
const qualityBoosters = "masterpiece, ultra-detailed, 8k resolution, photorealistic, cinematic lighting, sharp focus, octane render, unreal engine 5, highly intricate, volumetric fog, ray tracing";

// Presets de Estilos
const styles = {
cinematic: "film still, anamorphic lens, moody atmosphere, cinematic bokeh, 35mm photography",
romantic: "soft lighting, golden hour, dreamy aesthetic, ethereal, elegant, warm tones",
tech: "cyberpunk, futuristic, neon accents, high-tech interface, dark background, sharp edges",
art: "digital illustration, oil painting style, vibrant colors, expressive brushwork, fine art",
portrait: "close-up, professional studio lighting, depth of field, detailed skin texture, hyper-realistic"
};

const chosenStyle = styles[style] || styles.cinematic;

return ${prompt}, ${chosenStyle}, ${qualityBoosters};
}

/**

Función para descargar la imagen si se necesita procesar en el backend
*/
async function fetchImageBuffer(url) {
try {
const response = await axios.get(url, { responseType: 'arraybuffer' });
return Buffer.from(response.data, 'binary');
} catch (error) {
logger.error("Error al obtener buffer de imagen", error);
return null;
}
}

/**

detector de intención
*/
function isImagePrompt(input) {
const triggers = ['imagen', 'dibuja', 'foto', 'diseña', 'ilústrame'];
return triggers.some(word => input.toLowerCase().includes(word));
}

// --- EXPORTACIÓN ---
module.exports = {
generateImage,
fetchImageBuffer,
isImagePrompt,
buildProfessionalPrompt
};

/**

FOXAI - IMAGE GEN PROTOCOL

Esta implementación es GRATIS, ILIMITADA y no requiere API KEY.

Ideal para el despliegue en Render sin costos adicionales.
*/
// Fin del archivo imageGen.js