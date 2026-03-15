// ---------- 全域變數 ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let currentRoom = null;
let playerId = null;          // 'player1', 'player2', 'player3', 'player4'
let myTurn = false;
let lastTurn = null;
let cleanupInterval = null;

// 節點座標 (重新分散，畫布 900x650)
const nodePos = {
    A: { x: 450, y: 80 },   // 上中
    B: { x: 250, y: 150 },  // 左上
    C: { x: 150, y: 280 },  // 左中上
    D: { x: 200, y: 400 },  // 左中
    E: { x: 350, y: 480 },  // 中左
    F: { x: 550, y: 480 },  // 中右
    G: { x: 750, y: 400 },  // 右中
    H: { x: 650, y: 280 },  // 中上右
    I: { x: 700, y: 150 },  // 右上
    J: { x: 800, y: 200 },  // 右
    K: { x: 850, y: 350 },  // 右下
    L: { x: 700, y: 550 },  // 下右
    M: { x: 450, y: 600 }   // 下中
};

// 定義所有邊 (共28條)
const allEdges = [
    { id: 'AB', u: 'A', v: 'B' }, { id: 'AC', u: 'A', v: 'C' }, { id: 'AE', u: 'A', v: 'E' }, { id: 'AH', u: 'A', v: 'H' },
    { id: 'BC', u: 'B', v: 'C' }, { id: 'BD', u: 'B', v: 'D' }, { id: 'BE', u: 'B', v: 'E' }, { id: 'BF', u: 'B', v: 'F' },
    { id: 'CD', u: 'C', v: 'D' },
    { id: 'DE', u: 'D', v: 'E' }, { id: 'DF', u: 'D', v: 'F' },
    { id: 'EF', u: 'E', v: 'F' }, { id: 'EH', u: 'E', v: 'H' }, { id: 'EK', u: 'E', v: 'K' },
    { id: 'FH', u: 'F', v: 'H' }, { id: 'FM', u: 'F', v: 'M' },
    { id: 'GI', u: 'G', v: 'I' }, { id: 'GK', u: 'G', v: 'K' },
    { id: 'HI', u: 'H', v: 'I' }, { id: 'HJ', u: 'H', v: 'J' }, { id: 'HK', u: 'H', v: 'K' },
    { id: 'IJ', u: 'I', v: 'J' }, { id: 'IK', u: 'I', v: 'K' }, { id: 'IL', u: 'I', v: 'L' },
    { id: 'JK', u: 'J', v: 'K' },
    { id: 'KL', u: 'K', v: 'L' }, { id: 'KM', u: 'K', v: 'M' },
    { id: 'LM', u: 'L', v: 'M' }
];
const TOTAL_EDGES = allEdges.length;
const PLAYERS = ['player1', 'player2', 'player3', 'player4'];

// ---------- Firebase 初始化已在 firebase-config.js 完成，直接使用 database ----------

// ---------- 建立房間 ----------
document.getElementById('create-btn').addEventListener('click', createRoom);
document.getElementById('join-btn').addEventListener('click', joinRoom);

function createRoom() {
    const room = document.getElementById('room-input').value.trim();
    if (!room) { alert('請輸入房間號碼'); return; }
    currentRoom = room;
    playerId = 'player1';
    const roomRef = database.ref(`rooms/${room}`);
    const initialPlayers = {};
    PLAYERS.forEach((p, index) => {
        initialPlayers[p] = { start: null, edges: {}, joined: index === 0 };
    });
    roomRef.set({
        players: initialPlayers,
        turn: 'player1',
        gamePhase: 'waiting',
        edgesOwner: {},
        edgesScore: {},
        dices: [0, 0, 0],
        lastActive: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('waiting-room').style.display = 'block';
        document.getElementById('waiting-room-number').textContent = room;
        document.getElementById('start-game-btn').style.display = 'inline-block';
        generateStartButtons();
        listenRoom(room);
        startCleanupTimer(room);
    });
}

function joinRoom() {
    const room = document.getElementById('room-input').value.trim();
    if (!room) { alert('請輸入房間號碼'); return; }
    currentRoom = room;
    const roomRef = database.ref(`rooms/${room}`);
    roomRef.once('value').then(snap => {
        const data = snap.val();
        if (!data) { alert('房間不存在'); return; }
        let assignedPlayer = null;
        for (let p of PLAYERS) {
            if (!data.players[p].joined) {
                assignedPlayer = p;
                break;
            }
        }
        if (!assignedPlayer) { alert('房間已滿'); return; }
        playerId = assignedPlayer;
        const updates = {};
        updates[`players/${assignedPlayer}/joined`] = true;
        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
        roomRef.update(updates).then(() => {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('waiting-room').style.display = 'block';
            document.getElementById('waiting-room-number').textContent = room;
            document.getElementById('start-game-btn').style.display = 'none';
            generateStartButtons();
            listenRoom(room);
            startCleanupTimer(room);
        });
    });
}

// 生成 A~M 起點按鈕
function generateStartButtons() {
    const container = document.querySelector('.node-buttons');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 13; i++) {
        const node = String.fromCharCode(65 + i);
        const btn = document.createElement('button');
        btn.className = 'start-node';
        btn.dataset.node = node;
        btn.textContent = node;
        container.appendChild(btn);
    }
}

// ---------- 監聽房間資料 (修正版，加入自動切換) ----------
function listenRoom(room) {
    const roomRef = database.ref(`rooms/${room}`);
    roomRef.on('value', (snap) => {
        const data = snap.val();
        if (!data) {
            handleRoomDeleted();
            return;
        }

        // 自動檢查：如果所有玩家都已選起點，且目前為 start 階段，則自動進入 playing
        if (data.gamePhase === 'start') {
            const allStarts = PLAYERS.every(p => data.players[p]?.start != null);
            if (allStarts) {
                roomRef.child('gamePhase').set('playing');
                return; // 等待下一次觸發
            }
        }

        if (data.gamePhase === 'waiting') {
            document.getElementById('waiting-room').style.display = 'block';
            document.getElementById('game-play-section').style.display = 'none';
            updateWaitingRoom(data);
        } else {
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'block';
            updateGameUI(data);
        }
    });
}

function handleRoomDeleted() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    alert('房間已逾時或不存在，將返回登入畫面');
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-play-section').style.display = 'none';
    currentRoom = null;
    playerId = null;
}

// ---------- 定時清理房間 ----------
function startCleanupTimer(room) {
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = setInterval(() => {
        if (!currentRoom) return;
        const roomRef = database.ref(`rooms/${room}`);
        roomRef.once('value').then(snap => {
            const data = snap.val();
            if (!data) return;

            const now = Date.now();
            const lastActive = data.lastActive || 0;
            const fiveMinutes = 5 * 60 * 1000;
            const anyJoined = PLAYERS.some(p => data.players[p]?.joined);

            if (!anyJoined && (now - lastActive > fiveMinutes)) {
                console.log(`房間 ${room} 已空置超過5分鐘，自動刪除`);
                roomRef.remove().then(() => {
                    handleRoomDeleted();
                });
            }
        });
    }, 60000);
}

// ---------- 更新等待房間 UI ----------
function updateWaitingRoom(data) {
    const players = data.players;
    const allJoined = PLAYERS.every(p => players[p]?.joined);

    PLAYERS.forEach(p => {
        const statusEl = document.getElementById(`${p}-status`);
        if (statusEl) {
            statusEl.textContent = players[p]?.joined ? '✅' : '❌';
        }
        const waitingDiv = document.getElementById(`waiting-${p}`);
        if (waitingDiv) {
            if (p === playerId) {
                waitingDiv.classList.add('current-player');
            } else {
                waitingDiv.classList.remove('current-player');
            }
        }
    });

    if (playerId === 'player1' && allJoined) {
        document.getElementById('start-game-btn').style.display = 'inline-block';
        document.getElementById('waiting-hint').style.display = 'none';
    } else {
        document.getElementById('start-game-btn').style.display = 'none';
        if (playerId === 'player1') {
            document.getElementById('waiting-hint').textContent = '等待其他玩家加入⋯';
        } else {
            document.getElementById('waiting-hint').textContent = '等待房主開始遊戲⋯';
        }
        document.getElementById('waiting-hint').style.display = 'block';
    }
}

// ---------- 更新遊戲主畫面 UI ----------
function updateGameUI(data) {
    const gamePhase = data.gamePhase;
    const turn = data.turn;
    const players = data.players;
    const edgesOwner = data.edgesOwner || {};
    const edgesScore = data.edgesScore || {};

    myTurn = (turn === playerId);
    document.getElementById('turn-indicator').textContent = myTurn ? '👉 你的回合' : `👀 等待 ${turn}`;
    document.getElementById('current-player-label').textContent = `(你是 ${playerId})`;

    PLAYERS.forEach(p => {
        const el = document.getElementById(`${p}-info`);
        if (el) el.classList.remove('current-player');
    });
    const currentPlayerEl = document.getElementById(`${playerId}-info`);
    if (currentPlayerEl) currentPlayerEl.classList.add('current-player');

    PLAYERS.forEach(p => {
        const start = players[p]?.start;
        const el = document.getElementById(`${p}-start`);
        if (el) el.textContent = start ? `起點: ${start}` : '';
    });

    const joinedCount = PLAYERS.filter(p => players[p]?.joined).length;
    const roomStatusEl = document.getElementById('room-status');
    if (joinedCount < 4) {
        roomStatusEl.textContent = `⏳ 等待玩家加入 (${joinedCount}/4)`;
    } else if (gamePhase === 'start') {
        roomStatusEl.textContent = '👥 所有玩家已加入，請選擇起點';
    } else if (gamePhase === 'playing') {
        roomStatusEl.textContent = '⚔️ 遊戲進行中';
    } else if (gamePhase === 'ended') {
        roomStatusEl.textContent = '🏁 遊戲已結束';
    }

    // 顯示起點選擇區或邊選擇區
    const startSelection = document.getElementById('start-point-selection');
    const edgeSelection = document.getElementById('edge-selection');

    if (gamePhase === 'start') {
        if (startSelection) startSelection.style.display = 'block';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (players[playerId]?.start && startSelection) {
            startSelection.style.display = 'none';
        }
        document.getElementById('game-status').innerHTML = '請選擇你的起點 (A~M)';
    } else if (gamePhase === 'playing') {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'block';
        // 生成空邊按鈕，傳入完整 data 以便計算可占邊
        generateEdgeButtons(data);
        document.getElementById('game-status').innerHTML = '';
    } else {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
    }

    drawMap(edgesOwner, players);

    if (gamePhase === 'ended') {
        let summary = '遊戲結束！\n';
        PLAYERS.forEach(p => {
            const playerEdges = Object.keys(players[p]?.edges || {});
            const totalScore = playerEdges.reduce((sum, eid) => sum + (edgesScore[eid] || 0), 0);
            summary += `${p} 佔邊: ${playerEdges.join(', ')}  (總分: ${totalScore})\n`;
        });
        document.getElementById('game-status').innerText = summary;
        document.getElementById('reset-game-btn').style.display = 'inline-block';
    } else {
        document.getElementById('reset-game-btn').style.display = 'none';
    }
}

// 計算指定玩家的所有可到達點（起點 + 已佔邊的端點）
function getPlayerPointsFromData(playerId, data) {
    const players = data.players;
    const start = players[playerId]?.start;
    const edges = players[playerId]?.edges || {};
    const points = new Set();
    if (start) points.add(start);
    Object.keys(edges).forEach(edgeId => {
        const edge = allEdges.find(e => e.id === edgeId);
        if (edge) {
            points.add(edge.u);
            points.add(edge.v);
        }
    });
    return points;
}

// 生成所有可佔領的邊按鈕（只顯示當前玩家能佔的邊）
function generateEdgeButtons(data) {
    const edgesOwner = data.edgesOwner || {};
    const players = data.players;
    if (!players[playerId]) return;

    const playerPoints = getPlayerPointsFromData(playerId, data);
    
    const container = document.getElementById('edge-buttons-container');
    if (!container) {
        console.error('找不到 edge-buttons-container 元素');
        return;
    }
    container.innerHTML = '';

    // 找出所有空邊
    const emptyEdges = allEdges.filter(edge => !edgesOwner[edge.id]);
    
    // 篩選出可佔邊：至少一端在 playerPoints 中
    const availableEdges = emptyEdges.filter(edge => 
        playerPoints.has(edge.u) || playerPoints.has(edge.v)
    );

    if (availableEdges.length === 0) {
        container.innerHTML = '<p>沒有可佔領的邊</p>';
        return;
    }

    availableEdges.forEach(edge => {
        const btn = document.createElement('button');
        btn.className = 'edge-button';
        btn.dataset.edgeId = edge.id;
        btn.textContent = edge.id;
        // 如果不是自己的回合，禁用按鈕
        if (!myTurn) {
            btn.disabled = true;
        }
        container.appendChild(btn);
    });
}

// ---------- 繪圖函數 (邊的顏色已根據玩家設定) ----------
function drawMap(edgesOwner, players) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allEdges.forEach(edge => {
        const u = nodePos[edge.u];
        const v = nodePos[edge.v];
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineWidth = 4;
        const owner = edgesOwner[edge.id];
        if (owner === 'player1') ctx.strokeStyle = '#3498db';
        else if (owner === 'player2') ctx.strokeStyle = '#e74c3c';
        else if (owner === 'player3') ctx.strokeStyle = '#2ecc71';
        else if (owner === 'player4') ctx.strokeStyle = '#f39c12';
        else ctx.strokeStyle = '#7f8c8d';
        ctx.stroke();
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '12px monospace';
        ctx.fillText(edge.id, (u.x + v.x) / 2 - 15, (u.y + v.y) / 2 - 10);
    });

    for (let [node, pos] of Object.entries(nodePos)) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#f1c40f';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(node, pos.x - 8, pos.y + 6);
    }

    PLAYERS.forEach(p => {
        const start = players[p]?.start;
        if (start && nodePos[start]) {
            ctx.beginPath();
            ctx.arc(nodePos[start].x, nodePos[start].y, 26, 0, 2 * Math.PI);
            ctx.strokeStyle = p === 'player1' ? '#2980b9' :
                              p === 'player2' ? '#c0392b' :
                              p === 'player3' ? '#27ae60' : '#d35400';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

// ---------- 開始遊戲按鈕 ----------
document.getElementById('start-game-btn').addEventListener('click', () => {
    if (!currentRoom || playerId !== 'player1') return;
    database.ref(`rooms/${currentRoom}/players`).once('value').then(snap => {
        const players = snap.val();
        const allJoined = PLAYERS.every(p => players[p]?.joined);
        if (allJoined) {
            database.ref(`rooms/${currentRoom}`).update({
                gamePhase: 'start',
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        } else {
            alert('尚未集滿四位玩家，無法開始遊戲');
        }
    });
});

// ---------- 邊按鈕點擊事件 (加入可占邊驗證) ----------
document.getElementById('edge-buttons-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.edge-button');
    if (!btn) return;
    
    console.log('✅ 按鈕被點擊', btn.dataset.edgeId);
    console.log('   currentRoom:', currentRoom);
    console.log('   myTurn:', myTurn);
    console.log('   playerId:', playerId);
    
    if (!currentRoom || !myTurn) {
        alert('現在不是你的回合');
        return;
    }
    const edgeId = btn.dataset.edgeId;
    if (!edgeId) return;

    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        const data = snap.val();
        console.log('   完整資料:', data);
        if (!data) {
            alert('房間資料不存在');
            return;
        }
        // 確保 edgesOwner 存在
        if (!data.edgesOwner) {
            data.edgesOwner = {};
        }
        console.log('   當前遊戲階段:', data.gamePhase);
        if (data.gamePhase !== 'playing') {
            alert('遊戲不在進行中');
            return;
        }
        if (data.edgesOwner[edgeId]) {
            alert('這條邊已被佔');
            return;
        }

        // 驗證該邊是否可占（至少一端在自己的點集內）
        const playerPoints = getPlayerPointsFromData(playerId, data);
        const edge = allEdges.find(e => e.id === edgeId);
        if (!edge) return;
        if (!playerPoints.has(edge.u) && !playerPoints.has(edge.v)) {
            alert('你不能佔領這條邊：它與你的現有區域不相連');
            return;
        }

        // 擲骰
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const score = dice1 + dice2;
        console.log('   擲骰結果:', dice1, dice2, score);

        const updates = {};
        updates[`edgesOwner/${edgeId}`] = playerId;
        updates[`edgesScore/${edgeId}`] = score;
        updates[`players/${playerId}/edges/${edgeId}`] = true;
        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;

        // 決定下一位玩家
        const nextPlayer = (playerId === 'player4') ? 'player1' : 
                           (playerId === 'player1' ? 'player2' :
                            playerId === 'player2' ? 'player3' : 'player4');
        updates.turn = nextPlayer;

        const newOwnerCount = Object.keys(data.edgesOwner).length + 1;
        if (newOwnerCount === TOTAL_EDGES) {
            updates.gamePhase = 'ended';
        }

        database.ref(`rooms/${currentRoom}`).update(updates).then(() => {
            console.log('   ✅ 更新成功');
        }).catch(err => {
            console.error('   ❌ 更新失敗', err);
            alert('更新失敗：' + err.message);
        });
    }).catch(err => {
        console.error('   ❌ 讀取資料失敗', err);
    });
});

// ---------- 起點按鈕事件 ----------
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('start-node')) {
        const node = e.target.dataset.node;
        if (!currentRoom || !playerId) return;
        database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
            const data = snap.val();
            if (data.gamePhase === 'start' && !data.players[playerId]?.start) {
                const updates = {};
                updates[`players/${playerId}/start`] = node;
                updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
                database.ref(`rooms/${currentRoom}`).update(updates);
            }
        });
    }
});

// ---------- 退出房間 ----------
function exitRoom() {
    if (!currentRoom || !playerId) return;
    const roomRef = database.ref(`rooms/${currentRoom}`);
    const updates = {};
    updates[`players/${playerId}/joined`] = false;
    updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
    roomRef.update(updates).then(() => {
        roomRef.off();
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-play-section').style.display = 'none';
        currentRoom = null;
        playerId = null;
    });
}

document.getElementById('exit-room-btn').addEventListener('click', exitRoom);
document.getElementById('waiting-exit-btn').addEventListener('click', exitRoom);

// ---------- 重置遊戲 ----------
document.getElementById('reset-game-btn').addEventListener('click', () => {
    if (!currentRoom) return;
    const resetPlayers = {};
    PLAYERS.forEach((p, index) => {
        resetPlayers[p] = { start: null, edges: {}, joined: index === 0 };
    });
    database.ref(`rooms/${currentRoom}`).set({
        players: resetPlayers,
        turn: 'player1',
        gamePhase: 'waiting',
        edgesOwner: {},
        edgesScore: {},
        dices: [0, 0, 0],
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });
});