const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuração do CORS para permitir conexões externas
const io = new Server(server, {
  cors: { origin: import.meta.env.FRONT_BASE_URL }, // Permitir conexões do frontend
});

app.use(cors());

// Teste para verificar o servidor
app.get('/', (req, res) => {
  res.send('Servidor WebSocket rodando!');
});

const connectedClients = {};
const timers = {};
const gameData = {}

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

   // Envia o timer atual ao cliente
   socket.on('getTimer', (data) => {
        const { code } = data;
        // Se não existir um timer para o código, cria um estado inicial
        if (!timers[code]) {
          timers[code] = { timer: 0, isRunning: false };
        }
        // Envia o estado do timer para o cliente
        socket.emit('currentTimer', { code, ...timers[code] });
    });

    // Atualiza o timer em tempo real
    socket.on('updateTimer', (data) => {
        console.log("Timer atualizado:", data);
        const { code, timer, isRunning } = data;
        // Atualiza o timer e o estado de execução
        timers[code] = { timer, isRunning };
      
        // Envia o estado atualizado para todos os clientes conectados
        if (connectedClients[code]) {
          connectedClients[code].forEach((clientSocket) => {
            clientSocket.emit('timerUpdated', { code, timer, isRunning });
          });
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
const PORT = 3007;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
