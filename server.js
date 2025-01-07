require("dotenv").config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuração do CORS para permitir conexões externas
/* const io = new Server(server, {
  cors: { origin: process.env.FRONT_BASE_URL }, // Permitir conexões do frontend
}); */

/* const allowedOrigin = process.env.FRONT_PROD_BASE_URL || 'https://provision-padel.netlify.app'; */
const allowedOrigin = process.env.FRONT_PROD_BASE_URL || process.env.FRONT_PROD_BASE_URL;

const corsOptions = {
  origin: process.env.FRONT_PROD_BASE_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true, 
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: process.env.FRONT_PROD_BASE_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Teste para verificar o servidor
app.get('/', (req, res) => {
  res.send(`Servidor WebSocket rodando! ${corsOptions}`);
  console.log('corsOptions')
});

const connectedClients = {};
const timers = {};
const gameData = {}


const syncClientData = (code) => {
  if (connectedClients[code]) {
      connectedClients[code].forEach(socket => {
      if (gameData[code]) {
          socket.emit('gameUpdated', gameData[code]);
      }
    /*   if (timers[code]) {
          socket.emit('timerUpdated', timers[code]);
      } */
  });
  }
};
// Configuração do WebSocket
io.on('connection', (socket) => {
  const clientCode = socket.handshake.query.code;
  console.log('Cliente conectado com code:', clientCode);

  if (clientCode) {
    // Armazena o socket com base no código do cliente
    if (!connectedClients[clientCode]) {
      connectedClients[clientCode] = [];
    }
    connectedClients[clientCode].push(socket);
    
    // Sincroniza os dados no momento da conexão
    syncClientData(clientCode);

    // Envia uma confirmação ao cliente
    socket.emit('connected', { message: 'Conectado ao servidor!', code: clientCode });
  }

  // Recebe dados do frontend e emite para todos
  socket.on('updateGame', (data) => {
    const { code } = data;
    console.log(`Dados recebidos do code ${code}:`, data);

     // Atualiza o estado do jogo
     gameData[code] = data;
    // Envia os dados apenas para os clientes que possuem o mesmo `code`
    if (connectedClients[code]) {
        connectedClients[code].forEach((clientSocket) => {
            clientSocket.emit('gameUpdated', data); // Envia os dados para os sockets com o código correspondente
        });
    }
  });

    // Solicitação para obter o estado atual do jogo
    socket.on('getGame', (data) => {
        const { code } = data;
        if (gameData[code]) {
            socket.emit('gameUpdated', gameData[code]); // Envia os dados salvos
        }
    });

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
              io.emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
          }, 1000);
      }
      io.emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
  });

  socket.on('resetTimer', ({ code }) => {
      if (timers[code]) {
          clearInterval(timers[code].interval);
          timers[code] = { timer: 0, isRunning: false, interval: null };
          io.emit('timerUpdated', { code, timer: 0, isRunning: false });
      }
  });

  socket.on('updateTimerValue', ({ code, timer }) => {
      if (!timers[code]) {
          timers[code] = { timer: 0, isRunning: false, interval: null };
      }
      timers[code].timer = timer;
      io.emit('timerUpdated', { code, timer: timer, isRunning: timers[code].isRunning });
  });

  socket.on('getTimer', ({ code }) => {
      if (!timers[code]) {
          timers[code] = { timer: 0, isRunning: false };
      }
      const timer = timers[code];

      socket.emit('timerUpdated', { code, timer: timer.timer, isRunning: timer.isRunning });
  });

// Força a reconexão de todos os dispositivos de um cliente específico
  socket.on('forceReconnect', ({ code }) => {
    console.log(`Tentando reconectar manualmente todos os clientes com o code: ${code}`);
    
    if (connectedClients[code]) {
        connectedClients[code].forEach(clientSocket => {
            // Notifica e reconecta todos os clientes
            clientSocket.emit('forceConnected', { message: 'Reconectado com sucesso!', code });
        });
    } else {
        console.log(`Nenhum cliente encontrado com o code: ${code}`);
    }
});


  socket.on('forceDisconnect', ({ code }) => {
    console.log("NADAADDDDADADADDA")
      if (connectedClients[code]) {
          console.log(`Desconectando cliente: ${code}`);
          
          connectedClients[code].forEach(clientSocket => {
              clientSocket.emit('forceLogout'); // Notifica antes de desconectar
              clientSocket.disconnect(true);
          });

          delete connectedClients[code]; // Remove o cliente da lista após desconectar
      }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado com code:', clientCode);
    // Remove o socket do cliente da lista de clientes conectados
    if (connectedClients[clientCode]) {
        connectedClients[clientCode] = connectedClients[clientCode].filter(
          (clientSocket) => clientSocket !== socket
        );
      }

  });
});

// Porta onde o servidor irá rodar
const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`Servidor rodando em ${PORT}`);
});
