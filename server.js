require("dotenv").config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.FRONT_PROD_BASE_URL || '*';
const corsOptions = {
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true, 
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e6,
});

app.get('/', (req, res) => {
  res.send(`Servidor WebSocket rodando!`);
});

// Estruturas de dados
const timers = new Map();
const gameData = new Map();
const updateDebounce = new Map();
let globalToken = null;

// Função para limpar timer
function clearTimerForCode(code) {
  const timer = timers.get(code);
  if (timer?.interval) {
    clearInterval(timer.interval);
    timer.interval = null;
    timer.isRunning = false;
    timers.set(code, timer);
  }
}

// Função para limpar recursos de uma room
function cleanupRoom(code) {
  console.log(`[CLEANUP] Limpando recursos da room: ${code}`);
  clearTimerForCode(code);
  timers.delete(code);
  gameData.delete(code);
  updateDebounce.delete(code);
}

io.on('connection', (socket) => {
  const clientCode = socket.handshake.query.code;
  const socketId = socket.id;
  
  console.log(`[CONNECT] Socket: ${socketId}, Code: ${clientCode}`);
  
  if (!clientCode) {
    console.warn(`[ERROR] Socket ${socketId} sem code - desconectando`);
    socket.emit('error', { message: 'Code não fornecido' });
    socket.disconnect();
    return;
  }
  
  socket.join(clientCode);
  socket.emit('connected', { 
    message: 'Conectado ao servidor!', 
    code: clientCode,
    socketId: socketId 
  });
  
  // ====================
  // TOKEN HANDLERS
  // ====================
  
  socket.on('sendToken', (token) => {
    if (token) {
      globalToken = token;
      console.log(`[TOKEN] Token armazenado`);
      socket.emit('tokenStored', { message: 'Token armazenado com sucesso!' });
    }
  });
  
  socket.on('requestToken', () => {
    socket.emit('tokenAssigned', { token: globalToken });
  });
  
  // ====================
  // GAME DATA HANDLERS
  // ====================
  
  socket.on('updateGame', (data) => {
    const { code } = data;
    
    if (!code) {
      console.warn(`[ERROR] updateGame sem code do socket ${socketId}`);
      return;
    }
    
    // Sistema de debounce (50ms)
    const now = Date.now();
    const lastUpdate = updateDebounce.get(code) || 0;
    
    if (now - lastUpdate < 50) {
      console.log(`[DEBOUNCE] Update ignorado para ${code}`);
      return;
    }
    
    updateDebounce.set(code, now);
    
    console.log(`[UPDATE] Recebido de ${socketId}, code ${code}`);
    
    // Armazenar dados
    gameData.set(code, data);
    
    // 🔥 CRÍTICO: APENAS para outros clientes (NÃO para quem enviou)
    socket.to(code).emit('gameUpdated', data);
    
    // Confirmar para quem enviou (NÃO dispara watch no cliente)
    socket.emit('gameUpdateConfirmed', { code, success: true });
    
    console.log(`[UPDATE] Enviado para outros clientes da room ${code}`);
  });
  
  socket.on('getGame', ({ code }) => {
    const data = gameData.get(code);
    console.log(`[GET] Game data do code ${code}:`, data ? 'Encontrado' : 'Vazio');
    
    // Emitir apenas para quem pediu
    socket.emit('gameUpdated', data || null);
  });
  
  // ====================
  // TIMER HANDLERS
  // ====================
  
  socket.on('toggleTimer', ({ code }) => {
    if (!code) return;
    
    console.log(`[TIMER] Toggle do code ${code}`);
    
    if (!timers.has(code)) {
      timers.set(code, { timer: 0, isRunning: false, interval: null });
    }
    
    const timer = timers.get(code);
    
    if (timer.isRunning) {
      clearTimerForCode(code);
      console.log(`[TIMER] Pausado: ${code}`);
    } else {
      clearTimerForCode(code);
      
      timer.isRunning = true;
      timer.interval = setInterval(() => {
        timer.timer++;
        timers.set(code, timer);
        
        // 🔥 CRÍTICO: Broadcast para TODOS (timer é exceção)
        // Porque timer é atualizado pelo servidor, não pelos clientes
        io.to(code).emit('timerUpdated', { 
          code, 
          timer: timer.timer, 
          isRunning: timer.isRunning 
        });
      }, 1000);
      
      timers.set(code, timer);
      console.log(`[TIMER] Iniciado: ${code}`);
    }
    
    // Emitir estado atual para TODOS
    io.to(code).emit('timerUpdated', { 
      code, 
      timer: timer.timer, 
      isRunning: timer.isRunning 
    });
  });
  
  socket.on('resetTimer', ({ code }) => {
    if (!code) return;
    
    console.log(`[TIMER] Reset do code ${code}`);
    
    clearTimerForCode(code);
    timers.set(code, { timer: 0, isRunning: false, interval: null });
    
    // Emitir para TODOS
    io.to(code).emit('timerUpdated', { code, timer: 0, isRunning: false });
  });
  
  socket.on('updateTimerValue', ({ code, timer }) => {
    if (!code || timer === undefined) return;
    
    console.log(`[TIMER] Update value do code ${code}: ${timer}`);
    
    if (!timers.has(code)) {
      timers.set(code, { timer: 0, isRunning: false, interval: null });
    }
    
    const timerData = timers.get(code);
    timerData.timer = timer;
    timers.set(code, timerData);
    
    // Emitir para TODOS
    io.to(code).emit('timerUpdated', { 
      code, 
      timer: timer, 
      isRunning: timerData.isRunning 
    });
  });
  
  socket.on('getTimer', ({ code }) => {
    if (!code) return;
    
    const timer = timers.get(code) || { timer: 0, isRunning: false };
    console.log(`[TIMER] Get do code ${code}`);
    
    // Emitir apenas para quem pediu
    socket.emit('timerUpdated', { 
      code, 
      timer: timer.timer, 
      isRunning: timer.isRunning 
    });
  });
  
  // ====================
  // DISCONNECT HANDLER
  // ====================
  
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] Socket: ${socketId}, Reason: ${reason}`);
    
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(clientCode);
      
      if (!room || room.size === 0) {
        console.log(`[CLEANUP] Room ${clientCode} vazia`);
        cleanupRoom(clientCode);
      } else {
        console.log(`[INFO] Room ${clientCode} ainda tem ${room.size} cliente(s)`);
      }
    }, 5000);
  });
  
  socket.on('error', (error) => {
    console.error(`[ERROR] Socket ${socketId}:`, error);
  });
});

// ====================
// SHUTDOWN HANDLERS
// ====================

function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] Recebido ${signal}`);
  
  for (const [code] of timers) {
    clearTimerForCode(code);
  }
  
  server.close(() => {
    console.log('[SHUTDOWN] Servidor fechado');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('[SHUTDOWN] Forçando saída...');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ====================
// START SERVER
// ====================

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📡 Origin: ${allowedOrigin}`);
});