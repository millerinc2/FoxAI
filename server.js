'use strict';

/**

FoxAI - Main Server Engine v2.0.26

Core Architecture: Express + Socket.io + MongoDB Atlas

Integration: Groq AI, WhatsApp Flow, Document Generation, Advisor System

Deployment: Render (Backend) -> Vercel (Frontend)

Author: Jefferson Stivem Mendez
*/

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Importación de módulos internos del sistema FoxAI
const { logger } = require('./logger');
const { connectDB } = require('./database');
const { aiHandler } = require('./aiHandler');
const { handleIncomingMessage, resetFlow } = require('./whatsappFlow');
const { getUserMemory, saveUserMemory, addMessage } = require('./memory');
const { buildPersonalityPrompt } = require('./personality');
const { createFromAI, paths } = require('./documentGen');
const { listAdvisors, getAdvisorById } = require('./advisors');

// --- INICIALIZACIÓN DE APP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: {
origin: process.env.FRONTEND_URL || "*",
methods: ["GET", "POST"]
}
});

// --- MIDDLEWARES DE SEGURIDAD Y OPTIMIZACIÓN ---
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/generated', express.static(paths.generated));

// Rate Limiting para evitar abusos en la API
const apiLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
message: { error: 'Demasiadas solicitudes, intenta más tarde.' }
});

// --- CONEXIÓN A BASE DE DATOS ---
connectDB().then(() => {
logger.info('Motor FoxAI conectado exitosamente a MongoDB Atlas');
}).catch(err => {
logger.error('Fallo crítico en conexión a Base de Datos', err);
});

// --- RUTAS DE API REST ---

/**

Endpoint de Estado del Sistema
*/
app.get('/api/status', (req, res) => {
res.status(200).json({
status: 'online',
version: '2.0.26',
engine: 'FoxAI Cognitive Suite',
uptime: process.uptime(),
memoryUsage: process.memoryUsage()
});
});

/**

Endpoint Principal de Chat IA (REST)
*/
app.post('/api/chat', apiLimiter, async (req, res) => {
const { userId, message, options } = req.body;

if (!userId || !message) {
return res.status(400).json({ error: 'Faltan campos obligatorios: userId o message' });
}

try {
// 1. Recuperar Memoria Persistente
const memory = await getUserMemory(userId);

 // 2. Construir Personalidad Adaptativa
 const systemPrompt = buildPersonalityPrompt(memory.profile, memory.history);

 // 3. Procesar con Groq AI vía aiHandler
 const aiResponse = await aiHandler.generateText(message, systemPrompt, memory.history);

 // 4. Guardar Interacción
 await addMessage(userId, 'user', message);
 await addMessage(userId, 'ai', aiResponse);

 res.json({
     success: true,
     response: aiResponse,
     userId: userId
 });
} catch (error) {
logger.error('Error en API /chat', error);
res.status(500).json({ error: 'Error interno en el motor de IA' });
}
});

/**

Gestión de Perfiles de Usuario
*/
app.get('/api/user/:id', async (req, res) => {
try {
const memory = await getUserMemory(req.params.id);
res.json(memory.profile);
} catch (error) {
res.status(404).json({ error: 'Usuario no encontrado' });
}
});

app.post('/api/user/update', async (req, res) => {
const { userId, updates } = req.body;
try {
await saveUserMemory(userId, updates);
res.json({ success: true, message: 'Perfil actualizado' });
} catch (error) {
res.status(500).json({ error: 'Error actualizando perfil' });
}
});

/**

Endpoints de Generación de Documentos Reales
*/
app.post('/api/document/:format', apiLimiter, async (req, res) => {
const { format } = req.params;
const { content, userData } = req.body;

try {
const result = await createFromAI(format, content, userData);
res.json(result);
} catch (error) {
logger.error(Error generando documento ${format}, error);
res.status(500).json({ error: 'Error en la generación del archivo' });
}
});

/**

Listado de Asesores de Soporte
*/
app.get('/api/advisors', (req, res) => {
res.json(listAdvisors());
});

// --- LÓGICA DE WEBSOCKETS (SOCKET.IO) ---

io.on('connection', (socket) => {
logger.info(Nuevo cliente conectado via WebSocket: ${socket.id});

socket.on('join_session', async (userId) => {
    socket.join(userId);
    logger.debug(`Socket ${socket.id} unido a sesión de usuario: ${userId}`);
});

/**
 * Manejo de Mensajes en Tiempo Real con IA
 */
socket.on('send_message', async (data) => {
    const { userId, message, mode } = data;
    
    try {
        // Feedback visual: Escribiendo...
        socket.emit('ai_typing', { userId });

        const memory = await getUserMemory(userId);
        const systemPrompt = buildPersonalityPrompt(memory.profile, memory.history);
        
        const aiResponse = await aiHandler.generateText(message, systemPrompt, memory.history);
        
        await addMessage(userId, 'user', message);
        await addMessage(userId, 'ai', aiResponse);

        io.to(userId).emit('new_message', {
            role: 'ai',
            content: aiResponse,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Error en socket message', error);
        socket.emit('error', { message: 'Fallo al procesar el mensaje' });
    }
});

socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
});
});

// --- INTEGRACIÓN DE WHATSAPP WEBHOOK (Simulado para Baileys/Twilio/WPPConnect) ---

app.post('/webhook/whatsapp', async (req, res) => {
const { from, body } = req.body;

try {
    const result = await handleIncomingMessage(from, body);
    // Aquí se enviaría la respuesta al cliente de WhatsApp
    res.status(200).send('EVENT_RECEIVED');
} catch (error) {
    logger.error('Error en Webhook WhatsApp', error);
    res.status(500).send('ERROR');
}
});

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
logger.error('Error no manejado en la aplicación', err);
res.status(500).json({
error: 'Algo salió mal en el servidor de FoxAI',
details: process.env.NODE_ENV === 'development' ? err.message : null
});
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
logger.info(================================================ 🦊 FoxAI COGNITIVE ENGINE - ONLINE ================================================ 🚀 Servidor: http://localhost:${PORT} 🛠️ Entorno: ${process.env.NODE_ENV || 'production'} 📦 Database: MongoDB Atlas 🤖 IA: Groq (Llama 3 / Mixtral) ================================================);
});

/**

FOXAI SERVER PROTOCOL

Diseñado y optimizado para Jefferson Stivem Mendez.

Este archivo es el núcleo que garantiza la interconexión de todos los módulos.
*/
// Fin del archivo server.js