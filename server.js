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
});

app.get('/', (req, res) => {
  res.send(`Servidor WebSocket rodando!`);
});

const connectedClients = {};
const timers = {};
const gameData = {};
let clientTokens = {};

io.on('connection', (socket) => {
  const clientCode = socket.handshake.query.code;
  console.log('Cliente conectado com code:', clientCode);

  if (clientCode) {
    // Associar o socket à sala do clientCode
    socket.join(clientCode);
    connectedClients[clientCode] = connectedClients[clientCode] || [];
    connectedClients[clientCode].push(socket);

    socket.emit('connected', { message: 'Conectado ao servidor!', code: clientCode });
  }

  // Gerenciar o envio e recebimento de tokens
  socket.on('sendToken', (token) => {
    if (token) {
      clientTokens['globalToken'] = token;
      socket.emit('tokenStored', { message: 'Token armazenado com sucesso!' });
    }
  });

  socket.on('requestToken', () => {
    socket.emit('tokenAssigned', { token: clientTokens['globalToken'] || null });
  });

  // Atualização de dados do jogo
  socket.on('updateGame', (data) => {
    const { code } = data;
    console.log(`Dados recebidos do code ${code}:`, data);

    // Atualiza o estado do jogo
    gameData[code] = data;

    // Envia os dados apenas para os clientes associados ao mesmo código
    io.to(code).emit('gameUpdated', data);
  });

  socket.on('getGame', ({ code }) => {
    if (gameData[code]) {
      socket.emit('gameUpdated', gameData[code]);
    }
  });

  // Timer sincronizado por código
  socket.on('toggleTimer', ({ code }) => {
    if (!timers[code]) {
      timers[code] = { timer: 0, isRunning: false, interval: null };
    }

    const timer = timers[code];

    if (timer.isRunning) {
      clearInterval(timer.interval);
      timer.isRunning = false;
    } else {
      timer.isRunning = true;
      timer.interval = setInterval(() => {
        timer.timer++;
        io.to(code).emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
      }, 1000);
    }

    io.to(code).emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
  });

  socket.on('resetTimer', ({ code }) => {
    if (timers[code]) {
      clearInterval(timers[code].interval);
      timers[code] = { timer: 0, isRunning: false, interval: null };
      io.to(code).emit('timerUpdated', { code, timer: 0, isRunning: false });
    }
  });

  socket.on('updateTimerValue', ({ code, timer }) => {
    if (!timers[code]) {
      timers[code] = { timer: 0, isRunning: false, interval: null };
    }
    timers[code].timer = timer;
    io.to(code).emit('timerUpdated', { code, timer: timer, isRunning: timers[code].isRunning });
  });

  socket.on('getTimer', ({ code }) => {
    if (!timers[code]) {
      timers[code] = { timer: 0, isRunning: false };
    }
    const timer = timers[code];
    socket.emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado com code:', clientCode);
    if (connectedClients[clientCode]) {
      connectedClients[clientCode] = connectedClients[clientCode].filter(
        (clientSocket) => clientSocket !== socket
      );
    }
  });
});

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`Servidor rodando em ${PORT}`);
});
