 'use strict';

/**
 * FoxAI - Main Server Engine v2.0.26
 * Core Architecture: Express + Socket.io + MongoDB Atlas
 * Structure: /server.js (Root) -> backend/Modules/
 * Author: Jefferson Stivem Mendez
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

// --- IMPORTACIONES CORREGIDAS (Rutas relativas a raíz) ---
const { logger } = require('./backend/Modules/logger');
// Cambiamos 'connectDB' por 'init' que es lo que exporta tu database.js
const { init: connectDB } = require('./backend/Modules/database');
const { aiHandler } = require('./backend/Modules/aiHandler');
const { handleIncomingMessage } = require('./backend/Modules/whatsappFlow');
const { getUserMemory, addMessage } = require('./backend/Modules/memory');
const { buildPersonalityPrompt } = require('./backend/Modules/personality');
const { createFromAI } = require('./backend/Modules/documentGen');
const { listAdvisors } = require('./backend/Modules/advisors');

// --- INICIALIZACIÓN DE APP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    }
});

// --- MIDDLEWARES ---
app.use(helmet({
    contentSecurityPolicy: false, // Permite cargar recursos externos si es necesario
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos y frontend
app.use(express.static(path.join(__dirname, 'frontend')));
const generatedPath = path.join(__dirname, 'generated');
if (!require('fs').existsSync(generatedPath)) require('fs').mkdirSync(generatedPath);
app.use('/generated', express.static(generatedPath));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas solicitudes, intenta más tarde.' }
});

// --- CONEXIÓN A BASE DE DATOS ---
connectDB().then(() => {
    logger.success(`Motor FoxAI conectado exitosamente a la base de datos`);
}).catch(err => {
    logger.error(`Fallo crítico en conexión a Base de Datos:`, err);
});

// --- RUTAS DE API REST ---

app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: 'online',
        version: '2.0.26',
        engine: 'FoxAI Cognitive Suite',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
    });
});

app.post('/api/chat', apiLimiter, async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'Faltan datos' });

    try {
        const memory = await getUserMemory(userId);
        const systemPrompt = buildPersonalityPrompt(memory.profile, memory.history);
        const aiResponse = await aiHandler.generateText(message, systemPrompt, memory.history);
        
        await addMessage(userId, 'user', message);
        await addMessage(userId, 'ai', aiResponse);

        res.json({ success: true, response: aiResponse });
    } catch (error) {
        logger.error(`Error en API /chat:`, error);
        res.status(500).json({ error: 'Error interno' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    try {
        const memory = await getUserMemory(req.params.id);
        res.json(memory.profile);
    } catch (error) {
        res.status(404).json({ error: 'No encontrado' });
    }
});

app.post('/api/document/:format', apiLimiter, async (req, res) => {
    const { format } = req.params;
    try {
        const result = await createFromAI(format, req.body.content, req.body.userData);
        res.json(result);
    } catch (error) {
        logger.error(`Error generando documento ${format}:`, error);
        res.status(500).json({ error: 'Error de generación' });
    }
});

app.get('/api/advisors', (req, res) => {
    res.json(listAdvisors());
});

// Redirección para el frontend (SPA Friendly)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// --- LÓGICA DE WEBSOCKETS ---
io.on('connection', (socket) => {
    logger.info(`Nuevo cliente conectado via WebSocket: ${socket.id}`);

    socket.on('join_session', async (userId) => {
        socket.join(userId);
        logger.info(`Socket ${socket.id} unido a: ${userId}`);
    });

    socket.on('send_message', async (data) => {
        const { userId, message } = data;
        try {
            socket.emit('ai_typing', { userId });
            const memory = await getUserMemory(userId);
            const systemPrompt = buildPersonalityPrompt(memory.profile, memory.history);
            const aiResponse = await aiHandler.generateText(message, systemPrompt, memory.history);
            
            await addMessage(userId, 'user', message);
            await addMessage(userId, 'ai', aiResponse);

            io.to(userId).emit('new_message', { role: 'ai', content: aiResponse });
        } catch (error) {
            logger.error(`Error en socket:`, error);
        }
    });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`
    ================================================
    🦊 FoxAI COGNITIVE ENGINE - ONLINE
    ================================================
    🚀 Servidor: http://localhost:${PORT}
    📦 Database: MongoDB Atlas / JSON Sync
    🤖 IA: Groq / Multi-Model Active
    ================================================
    `);
});