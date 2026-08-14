
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const JUTSUS_DIRECTORY = path.join(
    __dirname,
    "jutsus"
);

const JUTSU_RELOAD_INTERVAL = 2000;

// =====================================================
// SERVIDOR HTTP
// =====================================================

app.get("/", (req, res) => {

    res.send(
        "Nindon Multiplayer Server ONLINE!"
    );

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
// JUTSUS ATIVOS
// =====================================================

const activeJutsus = new Map();

// =====================================================
// COOLDOWNS
//
// playerId -> Map(jutsuId -> timestamp)
// =====================================================

const playerCooldowns = new Map();

// =====================================================
// BANCO DE JUTSUS
//
// O servidor NÃO possui os jutsus aqui.
//
// Eles são carregados automaticamente
// da pasta:
//
//     /jutsus
//
// Exemplo:
//
//     jutsus/
//     ├── katon_goukakyuu.json
//     ├── rasengan.json
//     └── chidori.json
//
// Para criar um novo jutsu, basta criar
// um novo arquivo JSON.
// =====================================================

const JUTSUS = new Map();

// =====================================================
// CONTROLE DE ARQUIVOS DOS JUTSUS
// =====================================================

const loadedJutsuFiles = new Map();

// =====================================================
// GERAR ID DO PLAYER
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
// GERAR ID DO JUTSU ATIVO
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
// GARANTIR PASTA DE JUTSUS
// =====================================================

function ensureJutsuDirectory() {

    try {

        if (!fs.existsSync(JUTSUS_DIRECTORY)) {

            fs.mkdirSync(
                JUTSUS_DIRECTORY,
                {
                    recursive: true
                }
            );

            console.log(
                "[JUTSUS] Pasta criada:",
                JUTSUS_DIRECTORY
            );
        }

    } catch (error) {

        console.error(
            "[JUTSUS] Erro ao criar pasta:",
            error
        );

    }
}

// =====================================================
// VALIDAR DADO NUMÉRICO
// =====================================================

function positiveNumber(
    value,
    fallback
) {

    const number = Number(value);

    if (
        !Number.isFinite(number) ||
        number < 0
    ) {

        return fallback;

    }

    return number;
}

// =====================================================
// VALIDAR DADO INTEIRO
// =====================================================

function positiveInteger(
    value,
    fallback
) {

    const number = Number(value);

    if (
        !Number.isFinite(number) ||
        number < 0
    ) {

        return fallback;

    }

    return Math.floor(number);
}

// =====================================================
// NORMALIZAR JUTSU
//
// Isso garante que um JSON mal configurado
// não quebre o servidor inteiro.
// =====================================================

function normalizeJutsu(
    rawJutsu,
    filename
) {

    if (
        !rawJutsu ||
        typeof rawJutsu !== "object"
    ) {

        throw new Error(
            "O arquivo não contém um objeto JSON válido."
        );

    }

    const fileId =
        path.basename(
            filename,
            ".json"
        );

    const id =
        String(
            rawJutsu.id ||
            fileId
        ).trim();

    if (!id) {

        throw new Error(
            "O jutsu precisa possuir um ID."
        );

    }

    const name =
        String(
            rawJutsu.name ||
            id
        ).trim();

    const type =
        String(
            rawJutsu.type ||
            "projectile"
        ).trim();

    const jutsu = {

        id: id,

        name: name,

        type: type,

        damage:
            positiveNumber(
                rawJutsu.damage,
                0
            ),

        chakra_cost:
            positiveNumber(
                rawJutsu.chakra_cost,
                0
            ),

        speed:
            positiveNumber(
                rawJutsu.speed,
                0
            ),

        lifetime:
            positiveInteger(
                rawJutsu.lifetime,
                1000
            ),

        max_distance:
            positiveNumber(
                rawJutsu.max_distance,
                0
            ),

        cooldown:
            positiveInteger(
                rawJutsu.cooldown,
                0
            ),

        range:
            positiveNumber(
                rawJutsu.range,
                100
            ),

        hit_radius:
            positiveNumber(
                rawJutsu.hit_radius,
                50
            ),

        pierce:
            Boolean(
                rawJutsu.pierce
            ),

        projectile_count:
            Math.max(
                1,
                positiveInteger(
                    rawJutsu.projectile_count,
                    1
                )
            ),

        projectile_spread:
            positiveNumber(
                rawJutsu.projectile_spread,
                0
            ),

        can_hit_owner:
            Boolean(
                rawJutsu.can_hit_owner
            ),

        metadata:
            (
                rawJutsu.metadata &&
                typeof rawJutsu.metadata === "object"
            )
                ? rawJutsu.metadata
                : {}

    };

    return jutsu;
}

// =====================================================
// CARREGAR TODOS OS JUTSUS
// =====================================================

function loadJutsus() {

    ensureJutsuDirectory();

    let files;

    try {

        files =
            fs.readdirSync(
                JUTSUS_DIRECTORY
            );

    } catch (error) {

        console.error(
            "[JUTSUS] Não foi possível ler a pasta:",
            error
        );

        return;

    }

    const jsonFiles =
        files.filter(
            (file) =>
                file
                    .toLowerCase()
                    .endsWith(".json")
        );

    const discoveredFiles =
        new Set(
            jsonFiles
        );

    // =================================================
    // REMOVER JUTSUS DE ARQUIVOS QUE FORAM DELETADOS
    // =================================================

    for (
        const [filename] of
        loadedJutsuFiles
    ) {

        if (
            !discoveredFiles.has(
                filename
            )
        ) {

            const oldJutsu =
                loadedJutsuFiles.get(
                    filename
                );

            if (oldJutsu) {

                JUTSUS.delete(
                    oldJutsu.id
                );

                console.log(
                    "[JUTSUS] Removido:",
                    oldJutsu.id
                );

            }

            loadedJutsuFiles.delete(
                filename
            );
        }
    }

    // =================================================
    // CARREGAR / ATUALIZAR ARQUIVOS
    // =================================================

    for (
        const filename of
        jsonFiles
    ) {

        const filePath =
            path.join(
                JUTSUS_DIRECTORY,
                filename
            );

        try {

            const stats =
                fs.statSync(
                    filePath
                );

            const previous =
                loadedJutsuFiles.get(
                    filename
                );

            // -----------------------------------------
            // EVITAR RELEITURA DESNECESSÁRIA
            // -----------------------------------------

            if (
                previous &&
                previous.modifiedTime ===
                stats.mtimeMs
            ) {

                continue;

            }

            const fileContent =
                fs.readFileSync(
                    filePath,
                    "utf8"
                );

            const rawJutsu =
                JSON.parse(
                    fileContent
                );

            const jutsu =
                normalizeJutsu(
                    rawJutsu,
                    filename
                );

            // -----------------------------------------
            // SE O ARQUIVO MUDOU DE ID
            // -----------------------------------------

            if (
                previous &&
                previous.jutsu &&
                previous.jutsu.id !==
                jutsu.id
            ) {

                JUTSUS.delete(
                    previous.jutsu.id
                );

            }

            // -----------------------------------------
            // VERIFICAR DUPLICIDADE
            // -----------------------------------------

            const existing =
                JUTSUS.get(
                    jutsu.id
                );

            if (
                existing &&
                (
                    !previous ||
                    previous.jutsu.id !== jutsu.id
                )
            ) {

                console.error(
                    "[JUTSUS] ID DUPLICADO:",
                    jutsu.id,
                    "| Arquivo:",
                    filename
                );

                continue;

            }

            JUTSUS.set(
                jutsu.id,
                jutsu
            );

            loadedJutsuFiles.set(
                filename,
                {
                    modifiedTime:
                        stats.mtimeMs,

                    jutsu:
                        jutsu
                }
            );

            if (previous) {

                console.log(
                    "[JUTSUS] Atualizado:",
                    jutsu.id
                );

            } else {

                console.log(
                    "[JUTSUS] Carregado:",
                    jutsu.id
                );

            }

        } catch (error) {

            console.error(
                "[JUTSUS] Erro no arquivo:",
                filename
            );

            console.error(
                error.message
            );

        }
    }
}

// =====================================================
// CARREGAR JUTSUS INICIALMENTE
// =====================================================

loadJutsus();

// =====================================================
// RECARREGAR JUTSUS AUTOMATICAMENTE
//
// Assim você pode editar/criar JSON enquanto
// o servidor está rodando.
//
// Não precisa reiniciar o Node.
// =====================================================

setInterval(
    () => {

        loadJutsus();

    },
    JUTSU_RELOAD_INTERVAL
);

// =====================================================
// GERAR DADOS COMPLETOS DO PLAYER
// =====================================================

function getPlayerData(
    player
) {

    return {

        id:
            player.id,

        username:
            player.username,

        x:
            player.x,

        y:
            player.y,

        hp:
            player.hp,

        max_hp:
            player.max_hp,

        chakra:
            player.chakra,

        max_chakra:
            player.max_chakra,

        tc:
            player.tc,

        max_tc:
            player.max_tc

    };
}

// =====================================================
// ENVIAR PARA TODOS
// =====================================================

function broadcast(
    data,
    except = null
) {

    const message =
        JSON.stringify(
            data
        );

    wss.clients.forEach(
        (client) => {

            if (
                client !== except &&
                client.readyState ===
                    WebSocket.OPEN
            ) {

                client.send(
                    message
                );

            }

        }
    );
}

// =====================================================
// ENVIAR PARA UM CLIENTE
// =====================================================

function send(
    socket,
    data
) {

    if (
        socket.readyState ===
        WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(
                data
            )
        );

    }
}

// =====================================================
// DISTÂNCIA
// =====================================================

function distanceBetween(
    x1,
    y1,
    x2,
    y2
) {

    const dx =
        x2 - x1;

    const dy =
        y2 - y1;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}

// =====================================================
// VERIFICAR COOLDOWN
// =====================================================

function isJutsuOnCooldown(
    playerId,
    jutsuId
) {

    const cooldowns =
        playerCooldowns.get(
            playerId
        );

    if (!cooldowns) {

        return false;

    }

    const cooldownUntil =
        cooldowns.get(
            jutsuId
        );

    if (!cooldownUntil) {

        return false;

    }

    if (
        Date.now() >=
        cooldownUntil
    ) {

        cooldowns.delete(
            jutsuId
        );

        return false;

    }

    return true;
}

// =====================================================
// TEMPO RESTANTE DO COOLDOWN
// =====================================================

function getCooldownRemaining(
    playerId,
    jutsuId
) {

    const cooldowns =
        playerCooldowns.get(
            playerId
        );

    if (!cooldowns) {

        return 0;

    }

    const cooldownUntil =
        cooldowns.get(
            jutsuId
        );

    if (!cooldownUntil) {

        return 0;

    }

    return Math.max(
        0,
        cooldownUntil -
        Date.now()
    );
}

// =====================================================
// INICIAR COOLDOWN
// =====================================================

function startJutsuCooldown(
    playerId,
    jutsuId,
    duration
) {

    if (
        duration <= 0
    ) {

        return;

    }

    let cooldowns =
        playerCooldowns.get(
            playerId
        );

    if (!cooldowns) {

        cooldowns =
            new Map();

        playerCooldowns.set(
            playerId,
            cooldowns
        );

    }

    cooldowns.set(
        jutsuId,
        Date.now() +
        duration
    );
}

// =====================================================
// NORMALIZAR DIREÇÃO
// =====================================================

function normalizeDirection(
    x,
    y
) {

    let dirX =
        Number(x);

    let dirY =
        Number(y);

    if (
        !Number.isFinite(dirX)
    ) {

        dirX = 0;

    }

    if (
        !Number.isFinite(dirY)
    ) {

        dirY = 0;

    }

    const length =
        Math.sqrt(
            dirX * dirX +
            dirY * dirY
        );

    if (
        length <= 0
    ) {

        return {

            x: 0,

            y: 1

        };

    }

    return {

        x:
            dirX / length,

        y:
            dirY / length

    };
}

// =====================================================
// VERIFICAR DISTÂNCIA DO JUTSU
// =====================================================

function isWithinJutsuRange(
    projectile,
    x,
    y
) {

    if (
        projectile.max_distance <= 0
    ) {

        return true;

    }

    const distance =
        distanceBetween(
            projectile.origin_x,
            projectile.origin_y,
            x,
            y
        );

    return (
        distance <=
        projectile.max_distance
    );
}

// =====================================================
// CRIAR PROJÉTIL
// =====================================================

function createProjectile(
    player,
    jutsu,
    data
) {

    const direction =
        normalizeDirection(
            data.direction_x,
            data.direction_y
        );

    let x =
        Number(data.x);

    let y =
        Number(data.y);

    // -----------------------------------------------
    // O servidor usa a posição enviada pelo cliente
    // apenas como ponto inicial.
    //
    // Se o valor não for válido, usa a posição
    // real armazenada do jogador.
    // -----------------------------------------------

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {

        x = player.x;
        y = player.y;

    }

    const projectileId =
        generateJutsuId();

    const projectile = {

        id:
            projectileId,

        jutsu_id:
            jutsu.id,

        type:
            jutsu.type,

        owner_id:
            player.id,

        x:
            x,

        y:
            y,

        origin_x:
            x,

        origin_y:
            y,

        direction_x:
            direction.x,

        direction_y:
            direction.y,

        damage:
            jutsu.damage,

        speed:
            jutsu.speed,

        created_at:
            Date.now(),

        lifetime:
            jutsu.lifetime,

        max_distance:
            jutsu.max_distance,

        hit_radius:
            jutsu.hit_radius,

        pierce:
            jutsu.pierce,

        can_hit_owner:
            jutsu.can_hit_owner,

        range:
            jutsu.range,

        metadata:
            jutsu.metadata

    };

    activeJutsus.set(
        projectileId,
        projectile
    );

    return projectile;
}

// =====================================================
// DADOS PÚBLICOS DO JUTSU
//
// Não enviamos dano/custo ao cliente.
//
// O cliente só precisa saber como representar
// o jutsu.
// =====================================================

function getPublicJutsuData(
    projectile
) {

    return {

        id:
            projectile.id,

        jutsu_id:
            projectile.jutsu_id,

        type:
            projectile.type,

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
            projectile.lifetime,

        max_distance:
            projectile.max_distance,

        metadata:
            projectile.metadata

    };
}

// =====================================================
// NOVA CONEXÃO
// =====================================================

wss.on(
    "connection",
    (socket) => {

        // =================================================
        // CRIAR ID
        // =================================================

        const id =
            generatePlayerId();

        console.log(
            "--------------------------------"
        );

        console.log(
            "NOVO JOGADOR CONECTADO"
        );

        console.log(
            "ID:",
            id
        );

        console.log(
            "--------------------------------"
        );

        // =================================================
        // CRIAR PLAYER
        // =================================================

        const player = {

            id:
                id,

            username:
                "Jogador",

            x:
                0,

            y:
                0,

            hp:
                100,

            max_hp:
                100,

            chakra:
                100,

            max_chakra:
                100,

            tc:
                100,

            max_tc:
                100

        };

        players.set(
            id,
            player
        );

        playerCooldowns.set(
            id,
            new Map()
        );

        // =================================================
        // WELCOME
        // =================================================

        send(
            socket,
            {

                type:
                    "welcome",

                player:
                    getPlayerData(
                        player
                    )

            }
        );

        // =================================================
        // ENVIAR PLAYERS JÁ ONLINE
        // =================================================

        players.forEach(
            (otherPlayer) => {

                if (
                    otherPlayer.id !== id
                ) {

                    send(
                        socket,
                        {

                            type:
                                "player_join",

                            player:
                                getPlayerData(
                                    otherPlayer
                                )

                        }
                    );

                }

            }
        );

        // =================================================
        // AVISAR OS OUTROS
        // =================================================

        broadcast(
            {

                type:
                    "player_join",

                player:
                    getPlayerData(
                        player
                    )

            },
            socket
        );

        // =====================================================
        // MENSAGEM RECEBIDA
        // =====================================================

        socket.on(
            "message",
            (message) => {

                try {

                    const data =
                        JSON.parse(
                            message.toString()
                        );

                    if (
                        !data ||
                        typeof data !==
                            "object"
                    ) {

                        return;

                    }

                    // =================================================
                    // USERNAME
                    // =================================================

                    if (
                        data.type ===
                        "set_username"
                    ) {

                        let username =
                            String(
                                data.username ||
                                ""
                            ).trim();

                        if (
                            username.length ===
                            0
                        ) {

                            username =
                                "Jogador";

                        }

                        if (
                            username.length >
                            20
                        ) {

                            username =
                                username.substring(
                                    0,
                                    20
                                );

                        }

                        player.username =
                            username;

                        console.log(
                            "USERNAME ATUALIZADO:",
                            id,
                            "->",
                            player.username
                        );

                        broadcast({

                            type:
                                "player_update",

                            player:
                                getPlayerData(
                                    player
                                )

                        });

                        return;
                    }

                    // =================================================
                    // MOVIMENTO
                    // =================================================

                    if (
                        data.type ===
                        "move"
                    ) {

                        const x =
                            Number(
                                data.x
                            );

                        const y =
                            Number(
                                data.y
                            );

                        if (
                            Number.isFinite(x) &&
                            Number.isFinite(y)
                        ) {

                            player.x =
                                x;

                            player.y =
                                y;

                            broadcast(
                                {

                                    type:
                                        "player_update",

                                    player:
                                        getPlayerData(
                                            player
                                        )

                                },
                                socket
                            );

                        }

                        return;
                    }

                    // =================================================
                    // STATUS
                    // =================================================

                    if (
                        data.type ===
                        "stats_update"
                    ) {

                        const hp =
                            Number(
                                data.hp
                            );

                        const max_hp =
                            Number(
                                data.max_hp
                            );

                        const chakra =
                            Number(
                                data.chakra
                            );

                        const max_chakra =
                            Number(
                                data.max_chakra
                            );

                        const tc =
                            Number(
                                data.tc
                            );

                        const max_tc =
                            Number(
                                data.max_tc
                            );

                        // ---------------------------------------------
                        // HP
                        // ---------------------------------------------

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

                        // ---------------------------------------------
                        // CHAKRA
                        // ---------------------------------------------

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

                        // ---------------------------------------------
                        // TC
                        // ---------------------------------------------

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
                            getPlayerData(
                                player
                            );

                        broadcast(
                            {

                                type:
                                    "stats_update",

                                player:
                                    completePlayerData

                            },
                            socket
                        );

                        broadcast(
                            {

                                type:
                                    "player_update",

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

                    if (
                        data.type ===
                        "cast_jutsu"
                    ) {

                        const jutsuId =
                            String(
                                data.jutsu_id ||
                                ""
                            ).trim();

                        // =============================================
                        // PROCURAR NO BANCO
                        // =============================================

                        const jutsu =
                            JUTSUS.get(
                                jutsuId
                            );

                        // =============================================
                        // JUTSU NÃO EXISTE
                        // =============================================

                        if (!jutsu) {

                            console.log(
                                "JUTSU INVÁLIDO:",
                                jutsuId
                            );

                            send(
                                socket,
                                {

                                    type:
                                        "jutsu_error",

                                    reason:
                                        "Jutsu não encontrado.",

                                    jutsu_id:
                                        jutsuId

                                }
                            );

                            return;
                        }

                        // =============================================
                        // COOLDOWN
                        // =============================================

                        if (
                            isJutsuOnCooldown(
                                player.id,
                                jutsu.id
                            )
                        ) {

                            const remaining =
                                getCooldownRemaining(
                                    player.id,
                                    jutsu.id
                                );

                            send(
                                socket,
                                {

                                    type:
                                        "jutsu_error",

                                    reason:
                                        "Jutsu em cooldown.",

                                    jutsu_id:
                                        jutsu.id,

                                    cooldown_remaining:
                                        remaining

                                }
                            );

                            return;
                        }

                        // =============================================
                        // CHAKRA
                        // =============================================

                        if (
                            player.chakra <
                            jutsu.chakra_cost
                        ) {

                            console.log(
                                "CHAKRA INSUFICIENTE:",
                                id,
                                jutsu.name
                            );

                            send(
                                socket,
                                {

                                    type:
                                        "jutsu_error",

                                    reason:
                                        "Chakra insuficiente.",

                                    jutsu_id:
                                        jutsu.id

                                }
                            );

                            return;
                        }

                        // =============================================
                        // VERIFICAR POSIÇÃO
                        // =============================================

                        let castX =
                            Number(
                                data.x
                            );

                        let castY =
                            Number(
                                data.y
                            );

                        if (
                            !Number.isFinite(
                                castX
                            ) ||
                            !Number.isFinite(
                                castY
                            )
                        ) {

                            castX =
                                player.x;

                            castY =
                                player.y;

                        }

                        // =============================================
                        // EVITAR CASTAR MUITO LONGE DO PLAYER
                        // =============================================

                        const castDistance =
                            distanceBetween(
                                player.x,
                                player.y,
                                castX,
                                castY
                            );

                        if (
                            castDistance >
                            150
                        ) {

                            console.log(
                                "CAST REJEITADO:",
                                player.username,
                                "| distância:",
                                castDistance
                            );

                            return;
                        }

                        // =============================================
                        // GASTAR CHAKRA
                        // =============================================

                        player.chakra =
                            Math.max(
                                0,
                                player.chakra -
                                jutsu.chakra_cost
                            );

                        // =============================================
                        // COOLDOWN
                        // =============================================

                        startJutsuCooldown(
                            player.id,
                            jutsu.id,
                            jutsu.cooldown
                        );

                        // =============================================
                        // CRIAR JUTSU
                        // =============================================

                        const projectile =
                            createProjectile(
                                player,
                                jutsu,
                                {

                                    x:
                                        castX,

                                    y:
                                        castY,

                                    direction_x:
                                        data.direction_x,

                                    direction_y:
                                        data.direction_y

                                }
                            );

                        console.log(
                            "================================"
                        );

                        console.log(
                            "JUTSU USADO"
                        );

                        console.log(
                            "PLAYER:",
                            player.username
                        );

                        console.log(
                            "JUTSU:",
                            jutsu.name
                        );

                        console.log(
                            "TIPO:",
                            jutsu.type
                        );

                        console.log(
                            "ID:",
                            projectile.id
                        );

                        console.log(
                            "================================"
                        );

                        // =============================================
                        // AVISAR CLIENTES
                        // =============================================

                        broadcast({

                            type:
                                "jutsu_spawn",

                            jutsu:
                                getPublicJutsuData(
                                    projectile
                                )

                        });

                        // =============================================
                        // ATUALIZAR CHAKRA
                        // =============================================

                        broadcast({

                            type:
                                "player_update",

                            player:
                                getPlayerData(
                                    player
                                )

                        });

                        return;
                    }

                    // =====================================================
                    // JUTSU ATINGIU UM PLAYER
                    // =====================================================

                    if (
                        data.type ===
                        "jutsu_hit"
                    ) {

                        const projectileId =
                            String(
                                data.jutsu_id ||
                                ""
                            );

                        const targetId =
                            String(
                                data.target_id ||
                                ""
                            );

                        // =============================================
                        // PROJÉTIL EXISTE?
                        // =============================================

                        const projectile =
                            activeJutsus.get(
                                projectileId
                            );

                        if (!projectile) {

                            return;

                        }

                        // =============================================
                        // SOMENTE O DONO
                        // =============================================

                        if (
                            projectile.owner_id !==
                            id
                        ) {

                            console.log(
                                "JUTSU HIT BLOQUEADO:",
                                id,
                                "não é o dono."
                            );

                            return;
                        }

                        // =============================================
                        // NÃO ATINGIR O PRÓPRIO DONO
                        // =============================================

                        if (
                            targetId ===
                            projectile.owner_id &&
                            !projectile.can_hit_owner
                        ) {

                            return;

                        }

                        // =============================================
                        // PEGAR ALVO
                        // =============================================

                        const target =
                            players.get(
                                targetId
                            );

                        if (!target) {

                            return;

                        }

                        // =============================================
                        // POSIÇÃO DO ALVO
                        // =============================================

                        const hitX =
                            Number(
                                data.x
                            );

                        const hitY =
                            Number(
                                data.y
                            );

                        let targetX =
                            target.x;

                        let targetY =
                            target.y;

                        // =============================================
                        // O CLIENTE NÃO DEFINE A POSIÇÃO REAL
                        // DO ALVO.
                        //
                        // Usamos a posição que o servidor possui.
                        // =============================================

                        if (
                            Number.isFinite(
                                hitX
                            ) &&
                            Number.isFinite(
                                hitY
                            )
                        ) {

                            const reportedDistance =
                                distanceBetween(
                                    target.x,
                                    target.y,
                                    hitX,
                                    hitY
                                );

                            if (
                                reportedDistance >
                                100
                            ) {

                                console.log(
                                    "POSIÇÃO DO HIT SUSPEITA:",
                                    reportedDistance
                                );

                                return;

                            }

                        }

                        // =============================================
                        // DISTÂNCIA DO PROJÉTIL
                        // =============================================

                        const projectileDistance =
                            distanceBetween(
                                projectile.x,
                                projectile.y,
                                targetX,
                                targetY
                            );

                        const hitRange =
                            Math.max(
                                projectile.hit_radius,
                                projectile.range
                            );

                        if (
                            projectileDistance >
                            hitRange
                        ) {

                            console.log(
                                "IMPACTO REJEITADO:",
                                projectileDistance,
                                ">",
                                hitRange
                            );

                            return;

                        }

                        // =============================================
                        // APLICAR DANO
                        // =============================================

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
                            "JUTSU:",
                            projectile.jutsu_id
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

                        // =============================================
                        // DESTRUIR PROJÉTIL
                        // =============================================

                        if (
                            !projectile.pierce
                        ) {

                            activeJutsus.delete(
                                projectileId
                            );

                        }

                        // =============================================
                        // AVISAR TODOS
                        // =============================================

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

                        // =============================================
                        // ATUALIZAR PLAYER ATINGIDO
                        // =============================================

                        broadcast({

                            type:
                                "player_update",

                            player:
                                getPlayerData(
                                    target
                                )

                        });

                        return;
                    }

                    // =====================================================
                    // JUTSU TERMINOU
                    // =====================================================

                    if (
                        data.type ===
                        "jutsu_destroy"
                    ) {

                        const projectileId =
                            String(
                                data.jutsu_id ||
                                ""
                            );

                        const projectile =
                            activeJutsus.get(
                                projectileId
                            );

                        if (!projectile) {

                            return;

                        }

                        // =============================================
                        // SOMENTE O DONO
                        // =============================================

                        if (
                            projectile.owner_id !==
                            id
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

            }
        );

        // =====================================================
        // DESCONEXÃO
        // =====================================================

        socket.on(
            "close",
            () => {

                console.log(
                    "--------------------------------"
                );

                console.log(
                    "JOGADOR DESCONECTADO"
                );

                console.log(
                    "ID:",
                    id
                );

                console.log(
                    "--------------------------------"
                );

                players.delete(
                    id
                );

                playerCooldowns.delete(
                    id
                );

                // =============================================
                // REMOVER JUTSUS DO PLAYER
                // =============================================

                activeJutsus.forEach(
                    (
                        projectile,
                        projectileId
                    ) => {

                        if (
                            projectile.owner_id ===
                            id
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

                    id:
                        id

                });

            }
        );

        // =====================================================
        // ERRO
        // =====================================================

        socket.on(
            "error",
            (error) => {

                console.log(
                    "ERRO WEBSOCKET:",
                    error
                );

            }
        );

    }
);

// =====================================================
// LIMPEZA AUTOMÁTICA DE JUTSUS
// =====================================================

setInterval(
    () => {

        const now =
            Date.now();

        activeJutsus.forEach(
            (
                projectile,
                projectileId
            ) => {

                // =============================================
                // LIFETIME
                // =============================================

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

                    return;
                }

                // =============================================
                // DISTÂNCIA MÁXIMA
                // =============================================

                if (
                    projectile.max_distance >
                    0
                ) {

                    const distance =
                        distanceBetween(
                            projectile.origin_x,
                            projectile.origin_y,
                            projectile.x,
                            projectile.y
                        );

                    if (
                        distance >
                        projectile.max_distance
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

            }
        );

    },
    100
);

// =====================================================
// LIMPEZA DE COOLDOWNS
// =====================================================

setInterval(
    () => {

        const now =
            Date.now();

        playerCooldowns.forEach(
            (cooldowns) => {

                cooldowns.forEach(
                    (
                        cooldownUntil,
                        jutsuId
                    ) => {

                        if (
                            now >=
                            cooldownUntil
                        ) {

                            cooldowns.delete(
                                jutsuId
                            );

                        }

                    }
                );

            }
        );

    },
    1000
);

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

        console.log(
            "[JUTSUS]",
            JUTSUS.size,
            "jutsu(s) carregado(s)"
        );

        console.log(
            "================================"
        );

    }
);
