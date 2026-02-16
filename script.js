const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerCountDisplay = document.getElementById('player-count');
const startScreen = document.getElementById('start-screen');
const uiOverlay = document.getElementById('ui-overlay');
const joinForm = document.getElementById('join-form');
const nicknameInput = document.getElementById('nickname');
const bestScoreDisplay = document.getElementById('best-score');
const hudName = document.getElementById('hud-name');
const hudKills = document.getElementById('hud-kills');
const hudHpBar = document.getElementById('hud-hp-bar');

// Mobile UI elements
const joyThumb = document.getElementById('joystick-thumb');
const joyBase = document.getElementById('joystick-zone');
const fireBtn = document.getElementById('mobile-fire');

const socket = io();

let players = {};
let bullets = [];
let enemies = [];
let myId = null;
let currentNickname = localStorage.getItem('nio_nickname') || '';
let highScore = parseInt(localStorage.getItem('nio_highscore')) || 0;
if (isNaN(highScore)) highScore = 0;

// Initialize UI
nicknameInput.value = currentNickname;
bestScoreDisplay.innerText = highScore;

const keys = { up: false, down: false, left: false, right: false };

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Input listeners
window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
        case 'w': keys.up = true; break;
        case 'a': keys.left = true; break;
        case 's': keys.down = true; break;
        case 'd': keys.right = true; break;
    }
    socket.emit('movement', keys);
});

window.addEventListener('keyup', (e) => {
    switch (e.key.toLowerCase()) {
        case 'w': keys.up = false; break;
        case 'a': keys.left = false; break;
        case 's': keys.down = false; break;
        case 'd': keys.right = false; break;
    }
    socket.emit('movement', keys);
});

// Mouse shooting
window.addEventListener('mousedown', (e) => {
    if (myId && players[myId]) {
        const p = players[myId];
        const worldX = e.clientX + p.x - canvas.width / 2;
        const worldY = e.clientY + p.y - canvas.height / 2;
        socket.emit('shoot', { x: worldX, y: worldY });
    }
});

// Mobile Controls Logic
let joystickData = { x: 0, y: 0, active: false };
const JOYSTICK_MAX_RADIUS = 35;

function handleTouch(e) {
    if (!joystickData.active) return;
    const rect = joyBase.getBoundingClientRect();
    const touch = e.touches[0];
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > JOYSTICK_MAX_RADIUS) {
        dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
        dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }

    joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;

    // Convert to WASD-like state
    keys.up = dy < -10;
    keys.down = dy > 10;
    keys.left = dx < -10;
    keys.right = dx > 10;
    socket.emit('movement', keys);
}

if (joyBase && joyThumb) {
    joyBase.addEventListener('touchstart', (e) => { joystickData.active = true; handleTouch(e); });
    joyBase.addEventListener('touchmove', (e) => { e.preventDefault(); handleTouch(e); });
    joyBase.addEventListener('touchend', () => {
        joystickData.active = false;
        joyThumb.style.transform = 'translate(0,0)';
        keys.up = keys.down = keys.left = keys.right = false;
        socket.emit('movement', keys);
    });
}

if (fireBtn) {
    fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (myId && players[myId]) {
            const p = players[myId];
            // Shoot in front of the player (using screen center-ish but offset)
            socket.emit('shoot', { x: p.x, y: p.y - 100 });
        }
    });
}

joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nicknameInput.value.trim();
    if (name) {
        currentNickname = name;
        localStorage.setItem('nio_nickname', name);

        // Proactive HUD update to avoid "USER" flash
        hudName.innerText = name;
        hudKills.innerText = '0';
        hudHpBar.style.width = '100%';

        socket.emit('join', name);
        startScreen.classList.add('hidden');
        uiOverlay.classList.remove('hidden');
    }
});

socket.on('connect', () => { myId = socket.id; });

socket.on('state', (state) => {
    players = state.players;
    bullets = state.bullets;
    enemies = state.enemies;
    playerCountDisplay.innerText = Object.keys(players).length;

    if (myId && players[myId]) {
        // Sync HUD with server reality
        const p = players[myId];
        if (p.nickname) hudName.innerText = p.nickname;
        hudKills.innerText = p.kills !== undefined ? p.kills : 0;
        hudHpBar.style.width = (p.hp !== undefined ? p.hp : 100) + '%';
    }
});

socket.on('death', (kills) => {
    const finalKills = parseInt(kills) || 0;
    if (finalKills > highScore) {
        highScore = finalKills;
        localStorage.setItem('nio_highscore', highScore);
        bestScoreDisplay.innerText = highScore;
    }
    alert(`NEURAL LINK SEVERED. Kills: ${finalKills}`);
    startScreen.classList.remove('hidden');
    uiOverlay.classList.add('hidden');
});

function draw() {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const me = players[myId];
    const camX = me ? me.x : canvas.width / 2;
    const camY = me ? me.y : canvas.height / 2;

    ctx.save();
    ctx.translate(-camX + canvas.width / 2, -camY + canvas.height / 2);

    drawGrid();

    enemies.forEach(e => { if (e.hp > 0) drawEnemy(e); });

    bullets.forEach(b => {
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    });

    for (const id in players) {
        drawPlayer(players[id], id === myId);
    }

    ctx.restore();

    requestAnimationFrame(draw);
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const worldSize = 3000;

    for (let x = 0; x <= worldSize; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldSize); ctx.stroke();
    }
    for (let y = 0; y <= worldSize; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldSize, y); ctx.stroke();
    }

    // World border
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.2)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, worldSize, worldSize);
}

function drawEnemy(e) {
    const radius = 20;

    // Glow effect
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = e.color;

    const gradient = ctx.createRadialGradient(e.x, e.y, 5, e.x, e.y, radius + 10);
    gradient.addColorStop(0, e.color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(e.x, e.y, radius + 10, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const barWidth = 40;
    ctx.fillStyle = '#333';
    ctx.fillRect(e.x - barWidth / 2, e.y - radius - 15, barWidth, 4);
    ctx.fillStyle = '#ff0033';
    ctx.fillRect(e.x - barWidth / 2, e.y - radius - 15, (e.hp / e.maxHp) * barWidth, 4);
}

function drawPlayer(player, isMe) {
    const radius = 20;

    ctx.save();
    ctx.shadowBlur = isMe ? 25 : 15;
    ctx.shadowColor = player.color;

    const gradient = ctx.createRadialGradient(player.x, player.y, 5, player.x, player.y, radius + 10);
    gradient.addColorStop(0, player.color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(player.x, player.y, radius + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(player.x, player.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Name text
    ctx.fillStyle = isMe ? '#fff' : 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 12px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText(player.nickname || 'Unknown', player.x, player.y - radius - 20);

    if (isMe) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(player.x, player.y, radius + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }
}

requestAnimationFrame(draw);
