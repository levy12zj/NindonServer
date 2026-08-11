const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// SERVIDOR HTTP
// =====================================================

app.get("/", (req, res) => {
    res.send("Nindon Multiplayer Server ONLINE!");
});

// =====================================================
// CRIAR SERVIDOR HTTP
// =====================================================

const server = http.createServer(app);

// =====================================================
// WEBSOCKET
// =====================================================

const wss = new WebSocket.Server({
    server: server
});

// =====================================================
// PLAYERS
// =====================================================

const players = new Map();

// =====================================================
// GERAR ID
// =====================================================

function generatePlayerId() {
    let id;

    do {
        id = Math.random()
            .toString(36)
            .substring(2, 10);
    } while (players.has(id));

    return id;
}

// =====================================================
// ENVIAR PARA TODOS
// =====================================================

function broadcast(data, except = null) {

    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {

        if (
            client !== except &&
            client.readyState === WebSocket.OPEN
        ) {
            client.send(message);
        }

    });
}

// =====================================================
// ENVIAR PARA UM CLIENTE
// =====================================================

function send(socket, data) {

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }

}

// =====================================================
// NOVA CONEXÃO
// =====================================================

wss.on("connection", (socket) => {

    // =================================================
    // CRIAR ID
    // =================================================

    const id = generatePlayerId();

    console.log("--------------------------------");
    console.log("NOVO JOGADOR CONECTADO");
    console.log("ID:", id);
    console.log("--------------------------------");

    // =================================================
    // CRIAR PLAYER
    // =================================================

    const player = {

        id: id,

        username: "Jogador",

        x: 0,

        y: 0

    };

    players.set(id, player);

    // =================================================
    // ENVIAR WELCOME
    // =================================================

    send(socket, {

        type: "welcome",

        player: player

    });

    // =================================================
    // ENVIAR PLAYERS QUE JÁ ESTÃO ONLINE
    // =================================================

    players.forEach((otherPlayer) => {

        if (otherPlayer.id !== id) {

            send(socket, {

                type: "player_join",

                player: otherPlayer

            });

        }

    });

    // =================================================
    // AVISAR OS OUTROS PLAYERS
    // =================================================

    broadcast({

        type: "player_join",

        player: player

    }, socket);

    // =====================================================
    // MENSAGEM RECEBIDA
    // =====================================================

    socket.on("message", (message) => {

        try {

            const data = JSON.parse(
                message.toString()
            );

            if (!data || typeof data !== "object") {
                return;
            }

            // =================================================
            // DEFINIR USERNAME
            // =================================================

            if (data.type === "set_username") {

                let username = String(
                    data.username || ""
                ).trim();

                if (username.length === 0) {
                    username = "Jogador";
                }

                // Limite de segurança
                if (username.length > 20) {
                    username = username.substring(0, 20);
                }

                player.username = username;

                console.log(
                    "USERNAME ATUALIZADO:",
                    id,
                    "->",
                    player.username
                );

                // ---------------------------------------------
                // AVISAR TODOS
                // ---------------------------------------------

                broadcast({

                    type: "player_update",

                    player: player

                });

                // ---------------------------------------------
                // CONFIRMAR PARA O PRÓPRIO PLAYER
                // ---------------------------------------------

                send(socket, {

                    type: "player_update",

                    player: player

                });

                return;
            }

            // =================================================
            // MOVIMENTO
            // =================================================

            if (data.type === "move") {

                const x = Number(data.x);
                const y = Number(data.y);

                if (
                    Number.isFinite(x) &&
                    Number.isFinite(y)
                ) {

                    player.x = x;
                    player.y = y;

                    // -----------------------------------------
                    // ENVIAR AOS OUTROS
                    // -----------------------------------------

                    broadcast({

                        type: "player_update",

                        player: player

                    }, socket);

                }

                return;
            }

        } catch (error) {

            console.log(
                "ERRO AO PROCESSAR MENSAGEM:",
                error
            );

        }

    });

    // =====================================================
    // DESCONEXÃO
    // =====================================================

    socket.on("close", () => {

        console.log("--------------------------------");
        console.log("JOGADOR DESCONECTADO");
        console.log("ID:", id);
        console.log("--------------------------------");

        players.delete(id);

        broadcast({

            type: "player_leave",

            id: id

        });

    });

    // =====================================================
    // ERRO
    // =====================================================

    socket.on("error", (error) => {

        console.log(
            "ERRO WEBSOCKET:",
            error
        );

    });

});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("================================");
        console.log("NINDON MULTIPLAYER ONLINE");
        console.log("================================");
        console.log(
            `Servidor rodando na porta ${PORT}`
        );
        console.log(
            `HTTP: http://localhost:${PORT}`
        );
        console.log(
            `WebSocket: ws://localhost:${PORT}`
        );
        console.log("================================");

    }
);