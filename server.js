
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
// CRIAR DADOS COMPLETOS DO PLAYER
// =====================================================

function getPlayerData(player) {
    return {
        id: player.id,
        username: player.username,

        x: player.x,
        y: player.y,

        hp: player.hp,
        max_hp: player.max_hp,

        chakra: player.chakra,
        max_chakra: player.max_chakra,

        tc: player.tc,
        max_tc: player.max_tc
    };
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
        y: 0,

        // =================================================
        // STATUS
        // =================================================

        hp: 100,
        max_hp: 100,

        chakra: 100,
        max_chakra: 100,

        tc: 100,
        max_tc: 100
    };

    players.set(id, player);

    // =================================================
    // WELCOME
    // =================================================

    send(socket, {
        type: "welcome",
        player: getPlayerData(player)
    });

    // =================================================
    // ENVIAR PLAYERS JÁ ONLINE
    // =================================================

    players.forEach((otherPlayer) => {

        if (otherPlayer.id !== id) {

            send(socket, {
                type: "player_join",
                player: getPlayerData(otherPlayer)
            });

        }

    });

    // =================================================
    // AVISAR OS OUTROS
    // =================================================

    broadcast(
        {
            type: "player_join",
            player: getPlayerData(player)
        },
        socket
    );

    // =====================================================
    // MENSAGEM RECEBIDA
    // =====================================================

    socket.on("message", (message) => {

        try {

            const data = JSON.parse(
                message.toString()
            );

            if (
                !data ||
                typeof data !== "object"
            ) {
                return;
            }

            // =================================================
            // USERNAME
            // =================================================

            if (data.type === "set_username") {

                let username = String(
                    data.username || ""
                ).trim();

                if (username.length === 0) {
                    username = "Jogador";
                }

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

                broadcast({
                    type: "player_update",
                    player: getPlayerData(player)
                });

                send(socket, {
                    type: "player_update",
                    player: getPlayerData(player)
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

                    broadcast(
                        {
                            type: "player_update",
                            player: getPlayerData(player)
                        },
                        socket
                    );

                }

                return;
            }

            // =================================================
            // STATUS
            // =================================================

            if (data.type === "stats_update") {

                const hp = Number(data.hp);
                const max_hp = Number(data.max_hp);

                const chakra = Number(data.chakra);
                const max_chakra = Number(data.max_chakra);

                const tc = Number(data.tc);
                const max_tc = Number(data.max_tc);

                // =================================================
                // HP
                // =================================================

                if (
                    Number.isFinite(hp) &&
                    Number.isFinite(max_hp)
                ) {

                    player.max_hp = Math.max(
                        1,
                        max_hp
                    );

                    player.hp = Math.max(
                        0,
                        Math.min(
                            hp,
                            player.max_hp
                        )
                    );

                }

                // =================================================
                // CHAKRA
                // =================================================

                if (
                    Number.isFinite(chakra) &&
                    Number.isFinite(max_chakra)
                ) {

                    player.max_chakra = Math.max(
                        1,
                        max_chakra
                    );

                    player.chakra = Math.max(
                        0,
                        Math.min(
                            chakra,
                            player.max_chakra
                        )
                    );

                }

                // =================================================
                // TC
                // =================================================

                if (
                    Number.isFinite(tc) &&
                    Number.isFinite(max_tc)
                ) {

                    player.max_tc = Math.max(
                        1,
                        max_tc
                    );

                    player.tc = Math.max(
                        0,
                        Math.min(
                            tc,
                            player.max_tc
                        )
                    );

                }

                // =================================================
                // LOG
                // =================================================

                console.log(
                    "STATUS ATUALIZADO:",
                    id,
                    "| HP:",
                    player.hp + "/" + player.max_hp,
                    "| Chakra:",
                    player.chakra + "/" + player.max_chakra,
                    "| TC:",
                    player.tc + "/" + player.max_tc
                );

                // =================================================
                // ENVIAR STATUS
                // =================================================

                const completePlayerData =
                    getPlayerData(player);

                // =================================================
                // STATUS ESPECÍFICO
                // =================================================

                broadcast(
                    {
                        type: "stats_update",
                        player: completePlayerData
                    },
                    socket
                );

                // =================================================
                // ATUALIZAR PLAYER
                // =================================================

                broadcast(
                    {
                        type: "player_update",
                        player: completePlayerData
                    },
                    socket
                );

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
