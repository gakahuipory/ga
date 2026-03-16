// ---------- 全域變數 ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const resultCanvas = document.getElementById('result-canvas');
const resultCtx = resultCanvas?.getContext('2d');
let currentRoom = null;
let playerId = null;          // 'player1', 'player2', 'player3', 'player4'
let myTurn = false;
let lastTurn = null;
let cleanupInterval = null;
let roomRef = null;           // 當前房間的 reference

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
    const roomInput = document.getElementById('room-input').value.trim();
    const roomError = document.getElementById('room-error-message');
    if (!/^\d{3,7}$/.test(roomInput)) {
        roomError.textContent = '房間號碼必須是3-7位數字';
        return;
    }
    roomError.textContent = '';
    const room = roomInput;
    currentRoom = room;
    playerId = 'player1';
    roomRef = database.ref(`rooms/${room}`);
    roomRef.once('value').then(snap => {
        if (snap.exists()) {
            alert('房間號已存在，請使用其他號碼');
            currentRoom = null;
            return;
        }
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
            lastActive: firebase.database.ServerValue.TIMESTAMP,
            weakState: null
        }).then(() => {
            roomRef.onDisconnect().remove();
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('waiting-room').style.display = 'block';
            document.getElementById('waiting-room-number').textContent = room;
            document.getElementById('start-game-btn').style.display = 'inline-block';
            generateStartButtons();
            listenRoom(room);
            startCleanupTimer(room);
        });
    });
}

function joinRoom() {
    const roomInput = document.getElementById('room-input').value.trim();
    const roomError = document.getElementById('room-error-message');
    if (!/^\d{3,7}$/.test(roomInput)) {
        roomError.textContent = '房間號碼必須是3-7位數字';
        return;
    }
    roomError.textContent = '';
    const room = roomInput;
    currentRoom = room;
    roomRef = database.ref(`rooms/${room}`);
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

// ---------- 監聽房間資料 (修正版，支援 ended 階段) ----------
function listenRoom(room) {
    roomRef = database.ref(`rooms/${room}`);
    roomRef.on('value', (snap) => {
        const data = snap.val();
        console.log('監聽觸發，遊戲階段:', data?.gamePhase);
        if (!data) {
            handleRoomDeleted();
            return;
        }

        if (data.gamePhase === 'waiting') {
            document.getElementById('waiting-room').style.display = 'block';
            document.getElementById('game-play-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'none';
            updateWaitingRoom(data);
        } else if (data.gamePhase === 'ended') {
            // 遊戲結束，顯示結算頁面
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'block';
            showResult(data);
        } else {
            // playing, start, weak_claim 等階段顯示遊戲主畫面
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'block';
            document.getElementById('result-section').style.display = 'none';
            updateGameUI(data);

            // 自動檢查：如果所有玩家都已選起點，且目前為 start 階段，則自動進入 playing
            if (data.gamePhase === 'start') {
                const allStarts = PLAYERS.every(p => data.players[p]?.start != null);
                console.log('start階段，所有玩家已選起點?', allStarts);
                if (allStarts) {
                    roomRef.child('gamePhase').set('playing');
                }
            }
        }
    });
}

function handleRoomDeleted() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    alert('房間已移除或不存在，將返回登入畫面');
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-play-section').style.display = 'none';
    document.getElementById('result-section').style.display = 'none';
    currentRoom = null;
    playerId = null;
    roomRef = null;
}

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
    console.log('updateWaitingRoom', data);
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
    console.log('updateGameUI 被執行，遊戲階段:', data.gamePhase);
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
    } else if (gamePhase === 'weak_claim') {
        roomStatusEl.textContent = '🤝 弱勢方申請階段';
    } else if (gamePhase === 'ended') {
        roomStatusEl.textContent = '🏁 遊戲已結束';
    }

    const startSelection = document.getElementById('start-point-selection');
    const edgeSelection = document.getElementById('edge-selection');
    const weakSection = document.getElementById('weak-player-section');

    if (gamePhase === 'start') {
        if (startSelection) startSelection.style.display = 'block';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = 'none';
        if (players[playerId]?.start && startSelection) {
            startSelection.style.display = 'none';
        }
        document.getElementById('game-status').innerHTML = '請選擇你的起點 (A~M)';
    } else if (gamePhase === 'playing') {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'block';
        if (weakSection) weakSection.style.display = 'none';
        generateEdgeButtons(data);
        document.getElementById('game-status').innerHTML = '';
    } else if (gamePhase === 'weak_claim') {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = 'block';
        generateClaimButtons(data);
    } else {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = 'none';
    }

    drawMap(edgesOwner, players);
}

function getPlayerPointsFromData(playerId, data) {
    if (!data || !data.players) return new Set();
    const players = data.players;
    const player = players[playerId];
    if (!player) return new Set();
    const start = player.start;
    const edges = player.edges || {};
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

function generateEdgeButtons(data) {
    const edgesOwner = data.edgesOwner || {};
    const players = data.players;
    const edgesScore = data.edgesScore || {};
    if (!players[playerId]) return;

    const playerPoints = getPlayerPointsFromData(playerId, data);
    
    const container = document.getElementById('edge-buttons-container');
    if (!container) {
        console.error('找不到 edge-buttons-container 元素');
        return;
    }
    container.innerHTML = '';

    const emptyEdges = allEdges.filter(edge => !edgesOwner[edge.id]);
    
    let availableEdges = emptyEdges.filter(edge => 
        playerPoints.has(edge.u) || playerPoints.has(edge.v)
    );

    if (availableEdges.length === 0 && myTurn) {
        if (data.gamePhase === 'playing') {
            roomRef.child('gamePhase').set('weak_claim').then(() => {
                roomRef.child('weakState').set({
                    weakPlayer: playerId,
                    timestamp: Date.now()
                });
            });
        }
        container.innerHTML = '<p>你已無邊可佔，進入弱勢申請階段⋯</p>';
        return;
    }

    if (availableEdges.length === 0) {
        container.innerHTML = '<p>沒有可佔領的邊</p>';
        return;
    }

    availableEdges.forEach(edge => {
        const btn = document.createElement('button');
        btn.className = 'edge-button';
        btn.dataset.edgeId = edge.id;
        const score = edgesScore[edge.id];
        btn.textContent = score ? `${edge.id} (${score})` : edge.id;
        if (!myTurn) {
            btn.disabled = true;
        }
        container.appendChild(btn);
    });
}

function generateClaimButtons(data) {
    const weakState = data.weakState;
    if (!weakState || weakState.weakPlayer !== playerId) {
        document.getElementById('weak-player-section').style.display = 'none';
        return;
    }

    const edgesOwner = data.edgesOwner || {};
    const weakPoints = getPlayerPointsFromData(playerId, data);
    
    const strongEdges = allEdges.filter(edge => {
        const owner = edgesOwner[edge.id];
        if (!owner || owner === playerId) return false;
        return weakPoints.has(edge.u) || weakPoints.has(edge.v);
    });

    const uniqueEdges = [...new Set(strongEdges)];

    const container = document.getElementById('claim-buttons-container');
    if (!container) return;
    container.innerHTML = '';

    if (uniqueEdges.length === 0) {
        container.innerHTML = '<p>沒有可申請的邊</p>';
        document.getElementById('claim-info').textContent = '無法向任何強勢方申請，請等待系統處理⋯';
        return;
    }

    uniqueEdges.forEach(edge => {
        const btn = document.createElement('button');
        btn.className = 'claim-button';
        btn.dataset.edgeId = edge.id;
        const owner = edgesOwner[edge.id];
        btn.textContent = `向 ${owner} 申請 ${edge.id}`;
        container.appendChild(btn);
    });
    document.getElementById('claim-info').textContent = '點擊申請佔領該邊，你將投擲3顆骰子，被佔方獲得一次額外回合(1顆骰子)';
}

document.getElementById('claim-buttons-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.claim-button');
    if (!btn) return;
    const edgeId = btn.dataset.edgeId;
    if (!edgeId || !currentRoom) return;

    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        const data = snap.val();
        if (!data || data.gamePhase !== 'weak_claim') return;
        const weakState = data.weakState;
        if (!weakState || weakState.weakPlayer !== playerId) return;

        const edgesOwner = data.edgesOwner || {};
        const edge = allEdges.find(e => e.id === edgeId);
        if (!edge) return;
        const owner = edgesOwner[edgeId];
        if (!owner || owner === playerId) return;

        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const dice3 = Math.floor(Math.random() * 6) + 1;
        const score = dice1 + dice2 + dice3;

        const updates = {};
        updates[`edgesOwner/${edgeId}`] = playerId;
        updates[`edgesScore/${edgeId}`] = score;
        updates[`players/${playerId}/edges/${edgeId}`] = true;
        updates[`players/${owner}/edges/${edgeId}`] = null;

        updates.turn = owner;
        updates.extraTurn = true;
        updates.extraDiceCount = 1;

        updates.weakState = null;
        updates.gamePhase = 'playing';

        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;

        database.ref(`rooms/${currentRoom}`).update(updates);
    });
});

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
    console.log('開始遊戲按鈕被點擊');
    if (!currentRoom || playerId !== 'player1') {
        console.log('不是房主或房間無效');
        return;
    }
    database.ref(`rooms/${currentRoom}/players`).once('value').then(snap => {
        const players = snap.val();
        const allJoined = PLAYERS.every(p => players[p]?.joined);
        console.log('所有玩家已加入?', allJoined);
        if (allJoined) {
            database.ref(`rooms/${currentRoom}`).update({
                gamePhase: 'start',
                lastActive: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                console.log('遊戲階段已更新為 start');
            }).catch(err => {
                console.error('更新失敗', err);
            });
        } else {
            alert('尚未集滿四位玩家，無法開始遊戲');
        }
    });
});

// ---------- 邊按鈕點擊事件 ----------
document.getElementById('edge-buttons-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.edge-button');
    if (!btn) return;
    
    if (!currentRoom || !myTurn) {
        alert('現在不是你的回合');
        return;
    }
    const edgeId = btn.dataset.edgeId;
    if (!edgeId) return;

    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        try {
            const data = snap.val();
            if (!data) {
                alert('房間資料不存在');
                return;
            }
            if (data.gamePhase !== 'playing') {
                alert('遊戲不在進行中');
                return;
            }
            const edgesOwner = data.edgesOwner || {};
            if (edgesOwner[edgeId]) {
                alert('這條邊已被佔');
                return;
            }

            const playerPoints = getPlayerPointsFromData(playerId, data);
            const edge = allEdges.find(e => e.id === edgeId);
            if (!edge) return;
            if (!playerPoints.has(edge.u) && !playerPoints.has(edge.v)) {
                alert('你不能佔領這條邊：它與你的現有區域不相連');
                return;
            }

            let diceCount = 2;
            if (data.extraTurn && data.turn === playerId) {
                diceCount = data.extraDiceCount || 1;
            }
            let score = 0;
            for (let i = 0; i < diceCount; i++) {
                score += Math.floor(Math.random() * 6) + 1;
            }

            const updates = {};
            updates[`edgesOwner/${edgeId}`] = playerId;
            updates[`edgesScore/${edgeId}`] = score;
            updates[`players/${playerId}/edges/${edgeId}`] = true;
            updates.lastActive = firebase.database.ServerValue.TIMESTAMP;

            if (data.extraTurn) {
                updates.extraTurn = null;
                updates.extraDiceCount = null;
            }

            const nextPlayer = (playerId === 'player4') ? 'player1' : 
                               (playerId === 'player1' ? 'player2' :
                                playerId === 'player2' ? 'player3' : 'player4');
            updates.turn = nextPlayer;

            const newOwnerCount = Object.keys(data.edgesOwner || {}).length + 1;
            if (newOwnerCount === TOTAL_EDGES) {
                updates.gamePhase = 'ended';
            }

            database.ref(`rooms/${currentRoom}`).update(updates).then(() => {
                console.log('✅ 更新成功');
            }).catch(err => {
                console.error('❌ 更新失敗', err);
                alert('更新失敗：' + err.message);
            });
        } catch (err) {
            console.error('❌ 邊按鈕點擊處理錯誤', err);
            alert('發生錯誤：' + err.message);
        }
    }).catch(err => {
        console.error('❌ 讀取資料失敗', err);
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
    console.log('退出房間', playerId);
    if (!currentRoom || !playerId) return;
    const roomRefLocal = database.ref(`rooms/${currentRoom}`);
    if (playerId === 'player1') {
        roomRefLocal.remove().then(() => {
            handleRoomDeleted();
        }).catch(err => {
            console.error('刪除房間失敗', err);
        });
    } else {
        const updates = {};
        updates[`players/${playerId}/joined`] = false;
        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
        roomRefLocal.update(updates).then(() => {
            console.log('joined 已更新為 false');
            if (roomRef) roomRef.off();
            if (cleanupInterval) {
                clearInterval(cleanupInterval);
                cleanupInterval = null;
            }
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'none';
            currentRoom = null;
            playerId = null;
            roomRef = null;
        }).catch(err => {
            console.error('更新 joined 失敗', err);
            alert('退出失敗：' + err.message);
        });
    }
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
        lastActive: firebase.database.ServerValue.TIMESTAMP,
        weakState: null
    });
});

// ---------- 返回大廳 ----------
document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
    document.getElementById('result-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    if (roomRef) {
        roomRef.off();
        roomRef = null;
    }
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    currentRoom = null;
    playerId = null;
});

// ---------- 顯示結算頁面 (修正：顯示每位玩家的邊及分數) ----------
function showResult(data) {
    const players = data.players;
    const edgesScore = data.edgesScore || {};
    const edgesOwner = data.edgesOwner || {};

    // 顯示各玩家總分與邊數
    const resultDiv = document.getElementById('result-players-info');
    resultDiv.innerHTML = '';
    PLAYERS.forEach(p => {
        const playerEdges = Object.keys(players[p]?.edges || {});
        const totalScore = playerEdges.reduce((sum, eid) => sum + (edgesScore[eid] || 0), 0);
        const div = document.createElement('div');
        div.className = 'result-player';
        div.innerHTML = `${p}: ${playerEdges.length} 條邊，總分 ${totalScore}`;
        resultDiv.appendChild(div);
    });

    // 在 resultCanvas 上繪製當前玩家的佔邊圖形（包含分數標籤）
    if (resultCtx && playerId) {
        resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        // 繪製該玩家佔領的邊
        allEdges.forEach(edge => {
            if (edgesOwner[edge.id] === playerId) {
                const u = nodePos[edge.u];
                const v = nodePos[edge.v];
                resultCtx.beginPath();
                resultCtx.moveTo(u.x, u.y);
                resultCtx.lineTo(v.x, v.y);
                resultCtx.lineWidth = 4;
                resultCtx.strokeStyle = '#3498db';
                resultCtx.stroke();
                // 標記分數
                const score = edgesScore[edge.id];
                if (score) {
                    resultCtx.fillStyle = '#ecf0f1';
                    resultCtx.font = '12px monospace';
                    resultCtx.fillText(`${edge.id}(${score})`, (u.x + v.x) / 2 - 15, (u.y + v.y) / 2 - 10);
                }
            }
        });
        // 畫所有節點
        for (let [node, pos] of Object.entries(nodePos)) {
            resultCtx.beginPath();
            resultCtx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
            resultCtx.fillStyle = '#f1c40f';
            resultCtx.shadowColor = '#000';
            resultCtx.shadowBlur = 6;
            resultCtx.fill();
            resultCtx.shadowBlur = 0;
            resultCtx.strokeStyle = '#2c3e50';
            resultCtx.lineWidth = 2;
            resultCtx.stroke();
            resultCtx.fillStyle = '#2c3e50';
            resultCtx.font = 'bold 16px Arial';
            resultCtx.fillText(node, pos.x - 8, pos.y + 6);
        }
    }
}
