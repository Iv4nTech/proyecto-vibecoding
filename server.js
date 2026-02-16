const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const players = {};
const bullets = [];
const enemies = [];
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 1000;

// Initialize enemies
function spawnEnemy() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * (WORLD_WIDTH - 60) + 30,
        y: Math.random() * (WORLD_HEIGHT - 60) + 30,
        hp: 100,
        maxHp: 100,
        color: '#ff0033'
    };
}

for (let i = 0; i < 3; i++) {
    enemies.push(spawnEnemy());
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (nickname) => {
        const name = (nickname || 'Guest').substring(0, 15);
        players[socket.id] = {
            id: socket.id,
            nickname: name,
            x: Math.random() * (WORLD_WIDTH - 40) + 20,
            y: Math.random() * (WORLD_HEIGHT - 40) + 20,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            hp: 100,
            kills: 0
        };
        console.log(`Player ${name} (${socket.id}) joined`);
    });

    socket.on('movement', (data) => {
        const player = players[socket.id];
        if (!player) return;
        const speed = 5;
        if (data.left) player.x -= speed;
        if (data.right) player.x += speed;
        if (data.up) player.y -= speed;
        if (data.down) player.y += speed;

        if (player.x < 20) player.x = 20;
        if (player.x > WORLD_WIDTH - 20) player.x = WORLD_WIDTH - 20;
        if (player.y < 20) player.y = 20;
        if (player.y > WORLD_HEIGHT - 20) player.y = WORLD_HEIGHT - 20;
    });

    socket.on('shoot', (mousePos) => {
        const player = players[socket.id];
        if (!player) return;

        const angle = Math.atan2(mousePos.y - player.y, mousePos.x - player.x);
        bullets.push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            playerId: socket.id
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Game loop @ 60fps
setInterval(() => {
    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // Remove if off screen
        if (b.x < 0 || b.x > WORLD_WIDTH || b.y < 0 || b.y > WORLD_HEIGHT) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision detection with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (e.hp <= 0) continue;
            const dist = Math.hypot(b.x - e.x, b.y - e.y);
            if (dist < 25) {
                e.hp -= 20;
                bullets.splice(i, 1);

                if (e.hp <= 0) {
                    const deadEnemyIndex = j;
                    const killer = players[b.playerId];
                    if (killer) {
                        killer.kills = (killer.kills || 0) + 1;
                        console.log(`Kill recorded for ${killer.nickname}. Total: ${killer.kills}`);
                    }

                    setTimeout(() => {
                        enemies[deadEnemyIndex] = spawnEnemy();
                        console.log(`Enemy respawned at index ${deadEnemyIndex}`);
                    }, 3000);
                    enemies[deadEnemyIndex] = { ...enemies[deadEnemyIndex], hp: 0, x: -1000, y: -1000 };
                }
                break;
            }
        }
    }

    // Update enemies (AI) and handle Player Death
    enemies.forEach(e => {
        if (e.hp <= 0) return;

        let closestPlayer = null;
        let minDist = Infinity;

        for (const id in players) {
            const p = players[id];
            const dist = Math.hypot(e.x - p.x, e.y - p.y);

            // Player death collision
            if (dist < 35) { // Enemy radius 20 + Player radius 20 overlap
                io.to(id).emit('death', p.kills);
                delete players[id];
                continue;
            }

            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        }

        if (closestPlayer) {
            const angle = Math.atan2(closestPlayer.y - e.y, closestPlayer.x - e.x);
            e.x += Math.cos(angle) * 1.5; // Slow movement
            e.y += Math.sin(angle) * 1.5;
        }
    });

    io.emit('state', { players, bullets, enemies });
}, 1000 / 60);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
