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
  // Configurações para melhor performance
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.get('/', (req, res) => {
  res.send(`Servidor WebSocket rodando!`);
});

// Estruturas de dados simplificadas
const timers = {}; // { code: { timer, isRunning, interval } }
const gameData = {}; // { code: gameDataObject }
let globalToken = null;

// Função auxiliar para limpar timer
function clearTimerForCode(code) {
  if (timers[code]?.interval) {
    clearInterval(timers[code].interval);
    timers[code].interval = null;
    timers[code].isRunning = false;
  }
}

io.on('connection', (socket) => {
  const clientCode = socket.handshake.query.code;
  console.log(`Cliente conectado - Socket: ${socket.id}, Code: ${clientCode}`);
  
  if (!clientCode) {
    console.warn(`Socket ${socket.id} conectado sem code`);
    socket.disconnect();
    return;
  }
  
  // Adicionar à room
  socket.join(clientCode);
  socket.emit('connected', { message: 'Conectado ao servidor!', code: clientCode });
  
  // Token global
  socket.on('sendToken', (token) => {
    if (token) {
      globalToken = token;
      socket.emit('tokenStored', { message: 'Token armazenado com sucesso!' });
    }
  });
  
  socket.on('requestToken', () => {
    socket.emit('tokenAssigned', { token: globalToken });
  });
  
  // Game data
  socket.on('updateGame', (data) => {
    const { code } = data;
    console.log(`Dados recebidos do code ${code}:`, data);
    
    gameData[code] = data;
    io.to(code).emit('gameUpdated', data);
  });
  
  socket.on('getGame', ({ code }) => {
    socket.emit('gameUpdated', gameData[code] || null);
  });
  
  // Timer com proteção contra race conditions
  socket.on('toggleTimer', ({ code }) => {
    if (!timers[code]) {
      timers[code] = { timer: 0, isRunning: false, interval: null };
    }
    
    const timer = timers[code];
    
    if (timer.isRunning) {
      // Parar timer
      clearTimerForCode(code);
    } else {
      // Iniciar timer (garantir que não há outro rodando)
      clearTimerForCode(code);
      timer.isRunning = true;
      timer.interval = setInterval(() => {
        timer.timer++;
        io.to(code).emit('timerUpdated', { 
          code, 
          timer: timer.timer, 
          isRunning: timer.isRunning 
        });
      }, 1000);
    }
    
    io.to(code).emit('timerUpdated', { 
      code, 
      timer: timer.timer, 
      isRunning: timer.isRunning 
    });
  });
  
  socket.on('resetTimer', ({ code }) => {
    clearTimerForCode(code);
    timers[code] = { timer: 0, isRunning: false, interval: null };
    io.to(code).emit('timerUpdated', { code, timer: 0, isRunning: false });
  });
  
  socket.on('updateTimerValue', ({ code, timer }) => {
    if (!timers[code]) {
      timers[code] = { timer: 0, isRunning: false, interval: null };
    }
    timers[code].timer = timer;
    io.to(code).emit('timerUpdated', { 
      code, 
      timer: timer, 
      isRunning: timers[code].isRunning 
    });
  });
  
  socket.on('getTimer', ({ code }) => {
    const timer = timers[code] || { timer: 0, isRunning: false };
    socket.emit('timerUpdated', { 
      code, 
      timer: timer.timer, 
      isRunning: timer.isRunning 
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado - Socket: ${socket.id}, Code: ${clientCode}`);
    
    // Verificar se ainda há clientes na room
    const room = io.sockets.adapter.rooms.get(clientCode);
    if (!room || room.size === 0) {
      // Última pessoa saiu, limpar recursos
      console.log(`Room ${clientCode} vazia, limpando recursos...`);
      clearTimerForCode(clientCode);
      delete timers[clientCode];
      delete gameData[clientCode];
    }
  });
});

// Limpeza ao desligar servidor
process.on('SIGINT', () => {
  console.log('Desligando servidor...');
  Object.keys(timers).forEach(code => clearTimerForCode(code));
  server.close(() => {
    console.log('Servidor desligado');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
