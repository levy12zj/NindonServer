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
// JUTSUS ATIVOS
// =====================================================

const activeJutsus = new Map();

// =====================================================
// CONFIGURAÇÃO DOS JUTSUS
//
// Aqui ficam os dados dos jutsus.
//
// Para adicionar um novo jutsu futuramente,
// adicionamos apenas os dados aqui.
//
// O World não precisa conhecer o dano.
// =====================================================

const JUTSUS = {

    katon_goukakyuu: {
        id: "katon_goukakyuu",

        name: "Katon: Goukakyuu no Jutsu",

        damage: 30,

        chakra_cost: 20,

        speed: 500,

        lifetime: 3000,

        max_distance: 800
    },

    rasengan: {
        id: "rasengan",

        name: "Rasengan",

        damage: 50,

        chakra_cost: 35,

        speed: 0,

        lifetime: 1000,

        max_distance: 120
    }

};

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
// GERAR ID DO JUTSU
// =====================================================

function generateJutsuId() {

    let id;

    do {

        id = Math.random()
            .toString(36)
            .substring(2, 12);

    } while (activeJutsus.has(id));

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

        socket.send(
            JSON.stringify(data)
        );

    }
}

// =====================================================
// VERIFICAR DISTÂNCIA
// =====================================================

function distanceBetween(
    x1,
    y1,
    x2,
    y2
) {

    const dx = x2 - x1;
    const dy = y2 - y1;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
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

                    username =
                        username.substring(
                            0,
                            20
                        );

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

                            player:
                                getPlayerData(player)
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

                const hp =
                    Number(data.hp);

                const max_hp =
                    Number(data.max_hp);

                const chakra =
                    Number(data.chakra);

                const max_chakra =
                    Number(data.max_chakra);

                const tc =
                    Number(data.tc);

                const max_tc =
                    Number(data.max_tc);

                // =================================================
                // HP
                // =================================================

                if (
                    Number.isFinite(hp) &&
                    Number.isFinite(max_hp)
                ) {

                    player.max_hp =
                        Math.max(
                            1,
                            max_hp
                        );

                    player.hp =
                        Math.max(
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

                    player.max_chakra =
                        Math.max(
                            1,
                            max_chakra
                        );

                    player.chakra =
                        Math.max(
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

                    player.max_tc =
                        Math.max(
                            1,
                            max_tc
                        );

                    player.tc =
                        Math.max(
                            0,
                            Math.min(
                                tc,
                                player.max_tc
                            )
                        );

                }

                console.log(
                    "STATUS ATUALIZADO:",
                    id,
                    "| HP:",
                    player.hp +
                    "/" +
                    player.max_hp,

                    "| Chakra:",
                    player.chakra +
                    "/" +
                    player.max_chakra,

                    "| TC:",
                    player.tc +
                    "/" +
                    player.max_tc
                );

                const completePlayerData =
                    getPlayerData(player);

                // =================================================
                // STATUS ESPECÍFICO
                // =================================================

                broadcast(

                    {
                        type: "stats_update",

                        player:
                            completePlayerData
                    },

                    socket

                );

                // =================================================
                // PLAYER UPDATE
                // =================================================

                broadcast(

                    {
                        type: "player_update",

                        player:
                            completePlayerData
                    },

                    socket

                );

                return;
            }

            // =====================================================
            // USAR JUTSU
            // =====================================================

            if (data.type === "cast_jutsu") {

                const jutsuId =
                    String(
                        data.jutsu_id || ""
                    );

                const jutsu =
                    JUTSUS[jutsuId];

                // =================================================
                // JUTSU NÃO EXISTE
                // =================================================

                if (!jutsu) {

                    console.log(
                        "JUTSU INVÁLIDO:",
                        jutsuId
                    );

                    send(socket, {

                        type: "jutsu_error",

                        reason:
                            "Jutsu não encontrado.",

                        jutsu_id:
                            jutsuId
                    });

                    return;
                }

                // =================================================
                // VERIFICAR CHAKRA
                // =================================================

                if (
                    player.chakra <
                    jutsu.chakra_cost
                ) {

                    console.log(
                        "CHAKRA INSUFICIENTE:",
                        id,
                        jutsu.name
                    );

                    send(socket, {

                        type: "jutsu_error",

                        reason:
                            "Chakra insuficiente.",

                        jutsu_id:
                            jutsuId
                    });

                    return;
                }

                // =================================================
                // POSIÇÃO DO JUTSU
                // =================================================

                const x =
                    Number(data.x);

                const y =
                    Number(data.y);

                const direction_x =
                    Number(data.direction_x);

                const direction_y =
                    Number(data.direction_y);

                if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(y)
                ) {

                    return;

                }

                // =================================================
                // DIREÇÃO
                // =================================================

                let dirX =
                    Number.isFinite(direction_x)
                        ? direction_x
                        : 0;

                let dirY =
                    Number.isFinite(direction_y)
                        ? direction_y
                        : 0;

                const directionLength =
                    Math.sqrt(
                        dirX * dirX +
                        dirY * dirY
                    );

                if (
                    directionLength > 0
                ) {

                    dirX /=
                        directionLength;

                    dirY /=
                        directionLength;

                } else {

                    dirX = 0;
                    dirY = 1;

                }

                // =================================================
                // GASTAR CHAKRA
                // =================================================

                player.chakra =
                    Math.max(
                        0,
                        player.chakra -
                        jutsu.chakra_cost
                    );

                // =================================================
                // CRIAR JUTSU
                // =================================================

                const projectileId =
                    generateJutsuId();

                const projectile = {

                    id:
                        projectileId,

                    jutsu_id:
                        jutsu.id,

                    owner_id:
                        player.id,

                    x: x,
                    y: y,

                    direction_x:
                        dirX,

                    direction_y:
                        dirY,

                    damage:
                        jutsu.damage,

                    speed:
                        jutsu.speed,

                    created_at:
                        Date.now(),

                    lifetime:
                        jutsu.lifetime,

                    max_distance:
                        jutsu.max_distance
                };

                activeJutsus.set(
                    projectileId,
                    projectile
                );

                console.log(
                    "JUTSU USADO:",
                    player.username,
                    "->",
                    jutsu.name,
                    "| ID:",
                    projectileId
                );

                // =================================================
                // AVISAR TODOS OS CLIENTES
                // =================================================

                broadcast({

                    type:
                        "jutsu_spawn",

                    jutsu: {

                        id:
                            projectile.id,

                        jutsu_id:
                            projectile.jutsu_id,

                        owner_id:
                            projectile.owner_id,

                        x:
                            projectile.x,

                        y:
                            projectile.y,

                        direction_x:
                            projectile.direction_x,

                        direction_y:
                            projectile.direction_y,

                        speed:
                            projectile.speed,

                        lifetime:
                            projectile.lifetime
                    }

                });

                // =================================================
                // ATUALIZAR CHAKRA
                // =================================================

                broadcast({

                    type:
                        "player_update",

                    player:
                        getPlayerData(player)

                });

                return;
            }

            // =====================================================
            // JUTSU ATINGIU UM PLAYER
            // =====================================================

            if (data.type === "jutsu_hit") {

                const projectileId =
                    String(
                        data.jutsu_id || ""
                    );

                const targetId =
                    String(
                        data.target_id || ""
                    );

                // =================================================
                // VERIFICAR PROJÉTIL
                // =================================================

                if (
                    !activeJutsus.has(
                        projectileId
                    )
                ) {

                    return;

                }

                const projectile =
                    activeJutsus.get(
                        projectileId
                    );

                // =================================================
                // SOMENTE O DONO PODE CONFIRMAR
                // O IMPACTO DO PRÓPRIO PROJÉTIL
                // =================================================

                if (
                    projectile.owner_id !== id
                ) {

                    console.log(
                        "JUTSU HIT BLOQUEADO:",
                        id,
                        "não é o dono."
                    );

                    return;

                }

                // =================================================
                // NÃO PODE ATINGIR O PRÓPRIO DONO
                // =================================================

                if (
                    targetId ===
                    projectile.owner_id
                ) {

                    return;

                }

                // =================================================
                // PEGAR ALVO
                // =================================================

                const target =
                    players.get(
                        targetId
                    );

                if (!target) {

                    return;

                }

                // =================================================
                // VERIFICAR POSIÇÃO REAL
                // =================================================

                const hitX =
                    Number(data.x);

                const hitY =
                    Number(data.y);

                if (
                    Number.isFinite(
                        hitX
                    ) &&
                    Number.isFinite(
                        hitY
                    )
                ) {

                    const distance =
                        distanceBetween(
                            projectile.x,
                            projectile.y,
                            hitX,
                            hitY
                        );

                    // Pequena margem de segurança
                    // para evitar falsos impactos.

                    if (distance > 100) {

                        console.log(
                            "IMPACTO REJEITADO:",
                            distance
                        );

                        return;

                    }

                }

                // =================================================
                // APLICAR DANO
                // =================================================

                const oldHp =
                    target.hp;

                target.hp =
                    Math.max(
                        0,
                        target.hp -
                        projectile.damage
                    );

                console.log(
                    "================================"
                );

                console.log(
                    "DANO APLICADO"
                );

                console.log(
                    "ATACANTE:",
                    projectile.owner_id
                );

                console.log(
                    "ALVO:",
                    target.username
                );

                console.log(
                    "DANO:",
                    projectile.damage
                );

                console.log(
                    "HP:",
                    oldHp,
                    "->",
                    target.hp
                );

                console.log(
                    "================================"
                );

                // =================================================
                // DESTRUIR PROJÉTIL
                // =================================================

                activeJutsus.delete(
                    projectileId
                );

                // =================================================
                // AVISAR TODOS
                // =================================================

                broadcast({

                    type:
                        "jutsu_hit",

                    jutsu_id:
                        projectileId,

                    attacker_id:
                        projectile.owner_id,

                    target_id:
                        target.id,

                    damage:
                        projectile.damage,

                    hp:
                        target.hp,

                    max_hp:
                        target.max_hp

                });

                // =================================================
                // ATUALIZAR PLAYER ATINGIDO
                // =================================================

                broadcast({

                    type:
                        "player_update",

                    player:
                        getPlayerData(target)

                });

                return;
            }

            // =====================================================
            // JUTSU TERMINOU / SAIU DO MAPA
            // =====================================================

            if (data.type === "jutsu_destroy") {

                const projectileId =
                    String(
                        data.jutsu_id || ""
                    );

                if (
                    !activeJutsus.has(
                        projectileId
                    )
                ) {

                    return;

                }

                const projectile =
                    activeJutsus.get(
                        projectileId
                    );

                // Somente o dono pode destruir.

                if (
                    projectile.owner_id !== id
                ) {

                    return;

                }

                activeJutsus.delete(
                    projectileId
                );

                broadcast({

                    type:
                        "jutsu_destroy",

                    jutsu_id:
                        projectileId

                });

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

        // =================================================
        // REMOVER JUTSUS DO PLAYER
        // =================================================

        activeJutsus.forEach(
            (projectile, projectileId) => {

                if (
                    projectile.owner_id === id
                ) {

                    activeJutsus.delete(
                        projectileId
                    );

                    broadcast({

                        type:
                            "jutsu_destroy",

                        jutsu_id:
                            projectileId

                    });

                }

            }
        );

        broadcast({

            type:
                "player_leave",

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
// LIMPEZA AUTOMÁTICA DE JUTSUS
// =====================================================

setInterval(() => {

    const now = Date.now();

    activeJutsus.forEach(
        (projectile, projectileId) => {

            const age =
                now -
                projectile.created_at;

            if (
                age >
                projectile.lifetime
            ) {

                activeJutsus.delete(
                    projectileId
                );

                broadcast({

                    type:
                        "jutsu_destroy",

                    jutsu_id:
                        projectileId

                });

            }

        }
    );

}, 100);

// =====================================================
// INICIAR SERVIDOR
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            "NINDON MULTIPLAYER ONLINE"
        );

        console.log(
            "================================"
        );

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

        console.log(
            `HTTP: http://localhost:${PORT}`
        );

        console.log(
            `WebSocket: ws://localhost:${PORT}`
        );

        console.log(
            "================================"
        );

    }
);
