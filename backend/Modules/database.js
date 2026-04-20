'use strict';

/**

FoxAI - Advanced Hybrid Database Engine v2.0.26

Orchestration: MongoDB Atlas (Primary) + Secure Atomic JSON (Fallback/Sync).

Target: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// --- CONFIGURACIÓN DE RUTAS Y VARIABLES ---
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const MONGO_URI = process.env.MONGO_URI;

const SCHEMA_PATHS = {
users: path.join(DATA_DIR, 'users.json'),
chats: path.join(DATA_DIR, 'chats.json'),
config: path.join(DATA_DIR, 'config.json'),
backups: path.join(DATA_DIR, 'backups')
};

// --- ESTADO GLOBAL DEL MOTOR ---
const dbState = {
isMongoConnected: false,
isSyncing: false,
cache: {
users: new Map(),
config: {}
},
locks: new Set()
};

// --- INICIALIZACIÓN DE ENTORNO LOCAL ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCHEMA_PATHS.backups)) fs.mkdirSync(SCHEMA_PATHS.backups, { recursive: true });

Object.values(SCHEMA_PATHS).forEach(filePath => {
if (filePath.endsWith('.json') && !fs.existsSync(filePath)) {
fs.writeFileSync(filePath, JSON.stringify({ version: "1.0", data: [] }, null, 2));
}
});

// --- MONGODB CONNECTION MANAGER ---
const connectMongo = async () => {
if (!MONGO_URI) {
logger.warn("MONGO_URI no definida. Operando exclusivamente en modo JSON.");
return false;
}

try {
    await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    });
    dbState.isMongoConnected = true;
    logger.info("Conexión a MongoDB Atlas establecida exitosamente.");
    
    // Iniciar sincronización tras conexión exitosa
    await syncLocalToCloud();
    return true;
} catch (err) {
    dbState.isMongoConnected = false;
    logger.error("Error al conectar a MongoDB. Usando motor JSON secundario.", err);
    return false;
}
};

// Reconexión automática
mongoose.connection.on('disconnected', () => {
dbState.isMongoConnected = false;
logger.warn("MongoDB desconectado. Entrando en modo Fallback JSON.");
});

mongoose.connection.on('reconnected', () => {
dbState.isMongoConnected = true;
logger.info("MongoDB reconectado. Sincronizando datos...");
syncLocalToCloud();
});

// --- DEFINICIÓN DE SCHEMAS MONGODB ---
const UserSchema = new mongoose.Schema({
id: { type: String, required: true, unique: true },
name: String,
gender: String,
age: Number,
country: String,
relationship: String,
tone: String,
confidence: String,
onboardingComplete: { type: Boolean, default: false },
preferences: { type: Object, default: {} },
lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const ChatSchema = new mongoose.Schema({
userId: { type: String, required: true },
role: { type: String, enum: ['user', 'ai'], required: true },
content: { type: String, required: true },
timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Chat = mongoose.model('Chat', ChatSchema);

// --- MOTOR DE ESCRITURA ATÓMICA JSON ---
const JSONEngine = {
/**
* Lee un archivo JSON de forma segura evitando corrupción
*/
read: (key) => {
const filePath = SCHEMA_PATHS[key];
try {
const content = fs.readFileSync(filePath, 'utf8');
const parsed = JSON.parse(content);
return parsed.data || [];
} catch (err) {
logger.error(Fallo crítico leyendo ${key}.json. Intentando restaurar backup., err);
return JSONEngine.restore(key);
}
},

/**
 * Escribe datos usando técnica de archivo temporal para evitar corrupción
 */
write: async (key, data) => {
    if (dbState.locks.has(key)) return; // Prevención de colisión
    dbState.locks.add(key);

    const filePath = SCHEMA_PATHS[key];
    const tempPath = `${filePath}.tmp`;
    const backupPath = path.join(SCHEMA_PATHS.backups, `${key}_${Date.now()}.bak`);

    try {
        const payload = JSON.stringify({ version: "1.0", lastUpdate: Date.now(), data }, null, 2);
        
        // Escritura Atómica
        fs.writeFileSync(tempPath, payload, 'utf8');
        if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath); // Backup preventivo
        fs.renameSync(tempPath, filePath);
        
        // Limpieza de backups antiguos
        JSONEngine.cleanBackups(key);
    } catch (err) {
        logger.error(`Error en escritura atómica de ${key}`, err);
    } finally {
        dbState.locks.delete(key);
    }
},

restore: (key) => {
    const backups = fs.readdirSync(SCHEMA_PATHS.backups)
        .filter(f => f.startsWith(key))
        .sort()
        .reverse();

    if (backups.length > 0) {
        const latestBackup = path.join(SCHEMA_PATHS.backups, backups[0]);
        const content = fs.readFileSync(latestBackup, 'utf8');
        fs.writeFileSync(SCHEMA_PATHS[key], content);
        logger.info(`Archivo ${key}.json restaurado desde ${backups[0]}`);
        return JSON.parse(content).data;
    }
    return [];
},

cleanBackups: (key) => {
    const backups = fs.readdirSync(SCHEMA_PATHS.backups).filter(f => f.startsWith(key));
    if (backups.length > 10) {
        backups.sort().slice(0, backups.length - 10).forEach(file => {
            fs.unlinkSync(path.join(SCHEMA_PATHS.backups, file));
        });
    }
}
};

// --- FUNCIONES CRUD PRINCIPALES ---

/**

Gestión de Usuarios
*/
const UserDB = {
create: async (userData) => {
// Guardar en Cache
dbState.cache.users.set(userData.id, userData);

 // Guardar en JSON (Siempre como respaldo inmediato)
 const localData = JSONEngine.read('users');
 const index = localData.findIndex(u => u.id === userData.id);
 if (index !== -1) localData[index] = userData;
 else localData.push(userData);
 await JSONEngine.write('users', localData);

 // Guardar en MongoDB si está activo
 if (dbState.isMongoConnected) {
     try {
         await User.findOneAndUpdate({ id: userData.id }, userData, { upsert: true, new: true });
     } catch (err) {
         logger.error("Fallo guardando usuario en MongoDB", err);
     }
 }
 return userData;
},

get: async (id) => {
// 1. Intentar Cache
if (dbState.cache.users.has(id)) return dbState.cache.users.get(id);

 // 2. Intentar MongoDB
 if (dbState.isMongoConnected) {
     try {
         const user = await User.findOne({ id }).lean();
         if (user) {
             dbState.cache.users.set(id, user);
             return user;
         }
     } catch (err) {
         logger.error("Error consultando usuario en MongoDB", err);
     }
 }

 // 3. Fallback JSON
 const localData = JSONEngine.read('users');
 const user = localData.find(u => u.id === id);
 if (user) dbState.cache.users.set(id, user);
 return user;
},

update: async (id, updateFields) => {
const currentUser = await UserDB.get(id) || { id };
const updatedUser = { ...currentUser, ...updateFields, lastActive: new Date() };
return await UserDB.create(updatedUser);
}
};

/**

Gestión de Historial de Chats
*/
const ChatDB = {
save: async (messageData) => {
// messageData: { userId, role, content }

 // 1. Persistencia JSON
 const localChats = JSONEngine.read('chats');
 localChats.push({ ...messageData, timestamp: new Date() });
 // Limitar logs locales para evitar archivos masivos (ej. últimos 5000 mensajes)
 if (localChats.length > 5000) localChats.shift();
 await JSONEngine.write('chats', localChats);

 // 2. Persistencia MongoDB
 if (dbState.isMongoConnected) {
     try {
         await new Chat(messageData).save();
     } catch (err) {
         logger.error("Error guardando chat en MongoDB", err);
     }
 }
},

getHistory: async (userId, limit = 50) => {
if (dbState.isMongoConnected) {
try {
return await Chat.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean();
} catch (err) {
logger.error("Error recuperando chat de MongoDB", err);
}
}

 // Fallback JSON
 const localChats = JSONEngine.read('chats');
 return localChats
     .filter(c => c.userId === userId)
     .slice(-limit)
     .reverse();
}
};

// --- SISTEMA DE SINCRONIZACIÓN ---

/**

Sincroniza datos locales generados durante offline hacia la nube
*/
async function syncLocalToCloud() {
if (dbState.isSyncing || !dbState.isMongoConnected) return;
dbState.isSyncing = true;
logger.info("Iniciando sincronización Local -> MongoDB...");

try {
const localUsers = JSONEngine.read('users');
for (const user of localUsers) {
await User.findOneAndUpdate({ id: user.id }, user, { upsert: true });
}
logger.info(Sincronizados ${localUsers.length} usuarios.);
} catch (err) {
logger.error("Fallo durante la sincronización", err);
} finally {
dbState.isSyncing = false;
}
}

// --- UTILIDADES DE MANTENIMIENTO ---

const DBMaintenance = {
backupAll: async () => {
const timestamp = Date.now();
const users = JSONEngine.read('users');
const chats = JSONEngine.read('chats');

    const backupFile = path.join(SCHEMA_PATHS.backups, `FULL_BACKUP_${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ users, chats }, null, 2));
    logger.info(`Backup completo generado: ${backupFile}`);
},

clearTemp: () => {
    const files = fs.readdirSync(DATA_DIR);
    files.forEach(file => {
        if (file.endsWith('.tmp')) fs.unlinkSync(path.join(DATA_DIR, file));
    });
}
};

// --- EXPORTACIÓN DEL MÓDULO ---
module.exports = {
init: connectMongo,
users: UserDB,
chats: ChatDB,
maintenance: DBMaintenance,
status: () => ({
mongo: dbState.isMongoConnected,
cacheSize: dbState.cache.users.size,
syncing: dbState.isSyncing
})
};

/**

FoxAI Database Layer

Diseñado para Jefferson Stivem Mendez.

Prioriza la integridad del usuario Athalia y los logs del sistema.
*/
// Fin de database.js