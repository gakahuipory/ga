// ---------- 全域變數 ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const resultCanvas = document.getElementById('result-canvas');
const resultCtx = resultCanvas?.getContext('2d');
let currentRoom = null;
let playerId = null;
let myTurn = false;
let lastTurn = null;
let cleanupInterval = null;
let roomRef = null;

// 節點座標
const nodePos = {
    A: { x: 50, y: 96 },
    B: { x: 164, y: 233 },
    C: { x: 50, y: 371 },
    D: { x: 221, y: 371 },
    E: { x: 393, y: 233 },
    F: { x: 450, y: 417 },
    G: { x: 736, y: 600 },
    H: { x: 564, y: 50 },
    I: { x: 793, y: 417 },
    J: { x: 850, y: 142 },
    K: { x: 621, y: 325 },
    L: { x: 621, y: 600 },
    M: { x: 507, y: 508 }
};

// 所有邊
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
const ALL_PLAYERS = ['player1', 'player2', 'player3', 'player4', 'player5'];

// ---------- 綁定按鈕事件 ----------
document.getElementById('create-btn').addEventListener('click', createRoom);
document.getElementById('join-btn').addEventListener('click', joinRoom);
document.getElementById('start-game-btn').addEventListener('click', startGame);
document.getElementById('exit-room-btn').addEventListener('click', exitRoom);
document.getElementById('waiting-exit-btn').addEventListener('click', exitRoom);
document.getElementById('reset-game-btn').addEventListener('click', resetGame);
document.getElementById('back-to-lobby-btn').addEventListener('click', backToLobby);
const undoBtn = document.getElementById('undo-btn');
if (undoBtn) undoBtn.addEventListener('click', undoLastMove);

// 模式選擇事件
const modeSelect = document.getElementById('game-mode-select');
if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
        if (!currentRoom || playerId !== 'player1') return;
        const newMode = e.target.value;
        database.ref(`rooms/${currentRoom}/players`).once('value').then(snap => {
            const players = snap.val() || {};
            const joinedCount = ALL_PLAYERS.filter(p => players[p]?.joined).length;
            if (joinedCount > 1) {
                alert('已有其他玩家加入，無法切換模式');
                database.ref(`rooms/${currentRoom}/gameMode`).once('value').then(s => {
                    modeSelect.value = s.val() || 'normal';
                });
                return;
            }
            const updates = {
                gameMode: newMode,
                players: newMode === 'party' ? {
                    player1: { start: null, edges: {}, joined: true },
                    player2: { start: null, edges: {}, joined: false },
                    player3: { start: null, edges: {}, joined: false },
                    player4: { start: null, edges: {}, joined: false },
                    player5: { start: null, edges: {}, joined: false }
                } : {
                    player1: { start: null, edges: {}, joined: true },
                    player2: { start: null, edges: {}, joined: false },
                    player3: { start: null, edges: {}, joined: false },
                    player4: { start: null, edges: {}, joined: false },
                    player5: { start: null, edges: {}, joined: false }
                },
                gamePhase: 'waiting',
                turn: 'player1',
                edgesOwner: {},
                edgesScore: {},
                weakState: null,
                lastActive: firebase.database.ServerValue.TIMESTAMP,
                history: []
            };
            database.ref(`rooms/${currentRoom}`).update(updates);
        });
    });
}

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
    roomRef = firebase.database().ref(`rooms/${room}`);
    roomRef.once('value').then(snap => {
        if (snap.exists()) {
            alert('房間號已存在，請使用其他號碼');
            currentRoom = null;
            return;
        }
        const initialPlayers = {
            player1: { start: null, edges: {}, joined: true },
            player2: { start: null, edges: {}, joined: false },
            player3: { start: null, edges: {}, joined: false },
            player4: { start: null, edges: {}, joined: false },
            player5: { start: null, edges: {}, joined: false }
        };
        roomRef.set({
            players: initialPlayers,
            turn: 'player1',
            gamePhase: 'waiting',
            gameMode: 'normal',
            edgesOwner: {},
            edgesScore: {},
            dices: [0, 0, 0],
            lastActive: firebase.database.ServerValue.TIMESTAMP,
            weakState: null,
            history: []
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
    roomRef = firebase.database().ref(`rooms/${room}`);
    roomRef.once('value').then(snap => {
        const data = snap.val();
        if (!data) { alert('房間不存在'); return; }
        const gameMode = data.gameMode || 'normal';
        let availablePlayers;
        if (gameMode === 'party') {
            availablePlayers = ['player2', 'player3', 'player4', 'player5'];
        } else {
            availablePlayers = ['player1', 'player2', 'player3', 'player4'];
        }
        let assignedPlayer = null;
        for (let p of availablePlayers) {
            if (!data.players[p]?.joined) {
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

function listenRoom(room) {
    roomRef = firebase.database().ref(`rooms/${room}`);
    roomRef.on('value', (snap) => {
        const data = snap.val();
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
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'block';
            showResult(data);
        } else {
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'block';
            document.getElementById('result-section').style.display = 'none';
            updateGameUI(data);

            if (data.gamePhase === 'start') {
                const activePlayers = getActivePlayers(data);
                const allStarts = activePlayers.every(p => data.players[p]?.start != null);
                if (allStarts) {
                    roomRef.child('gamePhase').set('playing');
                }
            }
        }
    });
}

function getActivePlayers(data) {
    const mode = data.gameMode || 'normal';
    const players = data.players;
    if (mode === 'party') {
        return ['player2', 'player3', 'player4', 'player5'].filter(p => players[p]?.joined);
    } else {
        return ['player1', 'player2', 'player3', 'player4'].filter(p => players[p]?.joined);
    }
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
        const roomRef = firebase.database().ref(`rooms/${room}`);
        roomRef.once('value').then(snap => {
            const data = snap.val();
            if (!data) return;
            const now = Date.now();
            const lastActive = data.lastActive || 0;
            const fiveMinutes = 5 * 60 * 1000;
            const anyJoined = ALL_PLAYERS.some(p => data.players[p]?.joined);
            if (!anyJoined && (now - lastActive > fiveMinutes)) {
                console.log(`房間 ${room} 已空置超過5分鐘，自動刪除`);
                roomRef.remove().then(() => handleRoomDeleted());
            }
        });
    }, 60000);
}

function getTeamInfo(pid, gameMode) {
    if (gameMode === 'party') {
        switch (pid) {
            case 'player1': return { name: '裁判', color: '#95a5a6' };
            case 'player2': return { name: '藍隊', color: '#3498db' };
            case 'player3': return { name: '紅隊', color: '#e74c3c' };
            case 'player4': return { name: '綠隊', color: '#2ecc71' };
            case 'player5': return { name: '紫隊', color: '#9b59b6' };
            default: return { name: pid, color: '#000' };
        }
    } else {
        switch (pid) {
            case 'player1': return { name: '藍隊', color: '#3498db' };
            case 'player2': return { name: '紅隊', color: '#e74c3c' };
            case 'player3': return { name: '綠隊', color: '#2ecc71' };
            case 'player4': return { name: '紫隊', color: '#9b59b6' };
            default: return { name: pid, color: '#000' };
        }
    }
}

function updateWaitingRoom(data) {
    const players = data.players;
    const gameMode = data.gameMode || 'normal';

    const refereeDiv = document.getElementById('referee-info');
    if (refereeDiv) {
        if (gameMode === 'party') {
            refereeDiv.style.display = 'block';
            refereeDiv.innerHTML = playerId === 'player1' ? '👨‍⚖️ 你是裁判' : '👨‍⚖️ 裁判：房主';
        } else {
            refereeDiv.style.display = 'none';
        }
    }

    const waitingEls = {
        player1: document.getElementById('waiting-player1'),
        player2: document.getElementById('waiting-player2'),
        player3: document.getElementById('waiting-player3'),
        player4: document.getElementById('waiting-player4'),
        player5: document.getElementById('waiting-player5')
    };

    if (gameMode === 'party') {
        if (waitingEls.player1) waitingEls.player1.style.display = 'none';
        if (waitingEls.player2) waitingEls.player2.style.display = 'flex';
        if (waitingEls.player3) waitingEls.player3.style.display = 'flex';
        if (waitingEls.player4) waitingEls.player4.style.display = 'flex';
        if (waitingEls.player5) waitingEls.player5.style.display = 'flex';

        const partyPlayers = ['player2', 'player3', 'player4', 'player5'];
        partyPlayers.forEach(pid => {
            const el = waitingEls[pid];
            if (!el) return;
            const team = getTeamInfo(pid, gameMode);
            const joined = players[pid]?.joined ? '✅' : '❌';
            el.innerHTML = `${team.name} <span class="waiting-status" id="${pid}-status">${joined}</span>`;
            el.style.borderLeftColor = team.color;
            if (pid === playerId) {
                el.classList.add('current-player');
            } else {
                el.classList.remove('current-player');
            }
        });
    } else {
        if (waitingEls.player1) waitingEls.player1.style.display = 'flex';
        if (waitingEls.player2) waitingEls.player2.style.display = 'flex';
        if (waitingEls.player3) waitingEls.player3.style.display = 'flex';
        if (waitingEls.player4) waitingEls.player4.style.display = 'flex';
        if (waitingEls.player5) waitingEls.player5.style.display = 'none';

        const normalPlayers = ['player1', 'player2', 'player3', 'player4'];
        normalPlayers.forEach(pid => {
            const el = waitingEls[pid];
            if (!el) return;
            const team = getTeamInfo(pid, gameMode);
            const joined = players[pid]?.joined ? '✅' : '❌';
            el.innerHTML = `${team.name} <span class="waiting-status" id="${pid}-status">${joined}</span>`;
            el.style.borderLeftColor = team.color;
            if (pid === playerId) {
                el.classList.add('current-player');
            } else {
                el.classList.remove('current-player');
            }
        });
    }

    const activePlayers = getActivePlayers(data);
    const allJoined = activePlayers.length === 4;

    const modeSelectDiv = document.getElementById('mode-selection');
    if (modeSelectDiv) {
        if (playerId === 'player1') {
            modeSelectDiv.style.display = 'block';
            const select = document.getElementById('game-mode-select');
            if (select) select.value = gameMode;
        } else {
            modeSelectDiv.style.display = 'none';
        }
    }

    const startBtn = document.getElementById('start-game-btn');
    const hint = document.getElementById('waiting-hint');
    if (startBtn && hint) {
        if (playerId === 'player1' && allJoined) {
            startBtn.style.display = 'inline-block';
            hint.style.display = 'none';
        } else {
            startBtn.style.display = 'none';
            hint.style.display = 'block';
            hint.textContent = playerId === 'player1' ? '等待其他隊伍加入⋯' : '等待房主開始遊戲⋯';
        }
    }
}

function updateGameUI(data) {
    const gamePhase = data.gamePhase;
    const turn = data.turn;
    const players = data.players;
    const edgesOwner = data.edgesOwner || {};
    const edgesScore = data.edgesScore || {};
    const gameMode = data.gameMode || 'normal';

    const activePlayers = getActivePlayers(data);
    const isPlayer = activePlayers.includes(playerId);
    myTurn = isPlayer && (turn === playerId);

    const skillArea = document.getElementById('skill-area');
    const refereeActions = document.getElementById('referee-actions');
    if (skillArea && refereeActions) {
        if (gameMode === 'party' && playerId === 'player1') {
            skillArea.style.display = 'none';
            refereeActions.style.display = 'block';
        } else {
            skillArea.style.display = 'flex';
            refereeActions.style.display = 'none';
        }
    }

    if (!isPlayer && playerId === 'player1' && gameMode === 'party') {
        document.getElementById('turn-indicator').textContent = '👨‍⚖️ 裁判模式';
        document.getElementById('current-player-label').textContent = '(你是裁判)';
    } else {
        const team = getTeamInfo(turn, gameMode);
        document.getElementById('turn-indicator').textContent = myTurn ? '👉 你的回合' : `👀 等待 ${team.name}`;
        const myTeam = getTeamInfo(playerId, gameMode);
        document.getElementById('current-player-label').textContent = `(你是 ${myTeam.name})`;
    }

    ALL_PLAYERS.forEach(p => {
        const card = document.getElementById(`${p}-info`);
        if (!card) return;
        if (players[p]?.joined) {
            if (p === 'player1' && gameMode === 'party') {
                card.style.display = 'none';
            } else {
                card.style.display = 'block';
                const team = getTeamInfo(p, gameMode);
                const nameSpan = card.querySelector('.team-name');
                if (nameSpan) nameSpan.textContent = team.name;
                card.style.borderLeftColor = team.color;
            }
        } else {
            card.style.display = 'none';
        }
        if (p === turn && activePlayers.includes(p)) {
            card.classList.add('current-player');
        } else {
            card.classList.remove('current-player');
        }
        const startSpan = document.getElementById(`${p}-start`);
        if (startSpan) startSpan.textContent = players[p]?.start ? `起點: ${players[p].start}` : '';
    });

    const joinedCount = activePlayers.length;
    const statusEl = document.getElementById('room-status');
    if (statusEl) {
        if (joinedCount < 4) {
            statusEl.textContent = `⏳ 等待隊伍加入 (${joinedCount}/4)`;
        } else if (gamePhase === 'start') {
            statusEl.textContent = '👥 所有隊伍已加入，請選擇起點';
        } else if (gamePhase === 'playing') {
            statusEl.textContent = `⚔️ 遊戲進行中 (${gameMode === 'party' ? '派對模式' : '一般模式'})`;
        } else if (gamePhase === 'weak_claim') {
            statusEl.textContent = `🤝 弱勢方申請階段 (${gameMode === 'party' ? '派對模式' : '一般模式'})`;
        } else if (gamePhase === 'ended') {
            statusEl.textContent = '🏁 遊戲已結束';
        }
    }

    const startSelection = document.getElementById('start-point-selection');
    const edgeSelection = document.getElementById('edge-selection');
    const weakSection = document.getElementById('weak-player-section');

    if (gamePhase === 'start') {
        if (startSelection) startSelection.style.display = isPlayer && !players[playerId]?.start ? 'block' : 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = 'none';
        document.getElementById('game-status').innerHTML = '請選擇你的起點 (A~M)';
    } else if (gamePhase === 'playing') {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = isPlayer ? 'block' : 'none';
        if (weakSection) weakSection.style.display = 'none';
        if (isPlayer) generateEdgeButtons(data);
        document.getElementById('game-status').innerHTML = '';
    } else if (gamePhase === 'weak_claim') {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = isPlayer ? 'block' : 'none';
        if (isPlayer) generateClaimButtons(data);
    } else {
        if (startSelection) startSelection.style.display = 'none';
        if (edgeSelection) edgeSelection.style.display = 'none';
        if (weakSection) weakSection.style.display = 'none';
    }

    drawMap(edgesOwner, players, gameMode);
}

// 保存歷史記錄，確保欄位不為 undefined
function saveHistory(data) {
    const historySnapshot = {
        edgesOwner: JSON.parse(JSON.stringify(data.edgesOwner || {})),
        edgesScore: JSON.parse(JSON.stringify(data.edgesScore || {})),
        players: JSON.parse(JSON.stringify(data.players || {})),
        turn: data.turn,
        extraTurn: data.extraTurn === undefined ? null : data.extraTurn,
        extraDiceCount: data.extraDiceCount === undefined ? null : data.extraDiceCount,
        extraTurnOriginalNext: data.extraTurnOriginalNext === undefined ? null : data.extraTurnOriginalNext,
        weakState: data.weakState === undefined ? null : data.weakState
    };
    const history = data.history || [];
    history.push(historySnapshot);
    if (history.length > 100) history.shift();
    return history;
}

// 裁判返回上一步，確保所有更新欄位不為 undefined
function undoLastMove() {
    if (!currentRoom || playerId !== 'player1') return;
    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        const data = snap.val();
        if (!data) return;
        const gameMode = data.gameMode || 'normal';
        if (gameMode !== 'party') {
            alert('只有派對模式可以使用返回功能');
            return;
        }
        const history = data.history || [];
        if (history.length === 0) {
            alert('沒有可以返回的上一步');
            return;
        }
        const lastState = history[history.length - 1];
        // 確保所有欄位都不是 undefined，而是 null 或有效值
        const updates = {
            edgesOwner: lastState.edgesOwner || {},
            edgesScore: lastState.edgesScore || {},
            players: lastState.players || {},
            turn: lastState.turn,
            extraTurn: lastState.extraTurn === undefined ? null : lastState.extraTurn,
            extraDiceCount: lastState.extraDiceCount === undefined ? null : lastState.extraDiceCount,
            extraTurnOriginalNext: lastState.extraTurnOriginalNext === undefined ? null : lastState.extraTurnOriginalNext,
            weakState: lastState.weakState === undefined ? null : lastState.weakState,
            history: history.slice(0, -1),
            lastActive: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref(`rooms/${currentRoom}`).update(updates).then(() => {
            console.log('✅ 已返回上一步');
        }).catch(err => {
            console.error('❌ 返回失敗', err);
            alert('返回失敗：' + err.message);
        });
    });
}

function wouldSplitPlayerGraph(playerId, edgeId, data) {
    const playerEdges = Object.keys(data.players[playerId]?.edges || {});
    if (!playerEdges.includes(edgeId)) return false;
    const remainingEdges = playerEdges.filter(eid => eid !== edgeId);
    if (remainingEdges.length === 0) return false;
    const parent = {};
    const find = (x) => {
        if (parent[x] === undefined) parent[x] = x;
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
    };
    const union = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };
    remainingEdges.forEach(eid => {
        const edge = allEdges.find(e => e.id === eid);
        if (edge) {
            union(edge.u, edge.v);
        }
    });
    const nodes = new Set();
    remainingEdges.forEach(eid => {
        const edge = allEdges.find(e => e.id === eid);
        if (edge) {
            nodes.add(edge.u);
            nodes.add(edge.v);
        }
    });
    const roots = new Set();
    nodes.forEach(node => roots.add(find(node)));
    return roots.size > 1;
}

function generateClaimButtons(data) {
    const weakState = data.weakState;
    if (!weakState || weakState.weakPlayer !== playerId) {
        const weakSection = document.getElementById('weak-player-section');
        if (weakSection) weakSection.style.display = 'none';
        return;
    }
    const edgesOwner = data.edgesOwner || {};
    const weakPoints = getPlayerPointsFromData(playerId, data);
    const candidateEdges = allEdges.filter(edge => {
        const owner = edgesOwner[edge.id];
        if (!owner || owner === playerId) return false;
        return weakPoints.has(edge.u) || weakPoints.has(edge.v);
    });
    const strongEdges = candidateEdges.filter(edge => {
        const owner = edgesOwner[edge.id];
        return !wouldSplitPlayerGraph(owner, edge.id, data);
    });
    const uniqueEdges = [...new Set(strongEdges)];
    const container = document.getElementById('claim-buttons-container');
    if (!container) return;
    container.innerHTML = '';
    if (uniqueEdges.length === 0) {
        container.innerHTML = '<p>沒有可申請的邊</p>';
        const info = document.getElementById('claim-info');
        if (info) info.textContent = '無法向任何強勢方申請（所有相鄰邊都會使對方圖形分裂）⋯';
        return;
    }
    uniqueEdges.forEach(edge => {
        const btn = document.createElement('button');
        btn.className = 'claim-button';
        btn.dataset.edgeId = edge.id;
        btn.textContent = edge.id;
        container.appendChild(btn);
    });
    const info = document.getElementById('claim-info');
    if (info) info.textContent = '點擊申請佔領該邊（派對模式需手動輸入分數）';
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
        if (wouldSplitPlayerGraph(owner, edgeId, data)) {
            alert('此邊會使對方圖形分裂成兩個有邊的部分，不能申請！');
            return;
        }
        let score;
        if (data.gameMode === 'party') {
            const input = prompt(`請為線段 ${edgeId} 輸入三顆骰子總和 (3-18)：`);
            if (input === null) return;
            score = parseInt(input, 10);
            if (isNaN(score) || score < 3 || score > 18) {
                alert('請輸入有效的數字 (3-18)');
                return;
            }
        } else {
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const dice3 = Math.floor(Math.random() * 6) + 1;
            score = dice1 + dice2 + dice3;
        }
        const activePlayers = getActivePlayers(data);
        const currentIndex = activePlayers.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % activePlayers.length;
        const weakPlayerNext = activePlayers[nextIndex];
        const updates = {};
        updates[`edgesOwner/${edgeId}`] = playerId;
        updates[`edgesScore/${edgeId}`] = score;
        updates[`players/${playerId}/edges/${edgeId}`] = true;
        updates[`players/${owner}/edges/${edgeId}`] = null;
        updates.turn = owner;
        updates.extraTurn = true;
        updates.extraDiceCount = 1;
        updates.extraTurnOriginalNext = weakPlayerNext;
        updates.weakState = null;
        updates.gamePhase = 'playing';
        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
        const history = saveHistory(data);
        updates.history = history;
        database.ref(`rooms/${currentRoom}`).update(updates);
    });
});

function getPlayerPointsFromData(playerId, data) {
    if (!data?.players) return new Set();
    const player = data.players[playerId];
    if (!player) return new Set();
    const points = new Set(player.start ? [player.start] : []);
    Object.keys(player.edges || {}).forEach(edgeId => {
        const edge = allEdges.find(e => e.id === edgeId);
        if (edge) { points.add(edge.u); points.add(edge.v); }
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
    if (!container) return;
    container.innerHTML = '';
    const emptyEdges = allEdges.filter(edge => !edgesOwner[edge.id]);
    let availableEdges = emptyEdges.filter(edge => playerPoints.has(edge.u) || playerPoints.has(edge.v));
    if (availableEdges.length === 0 && myTurn) {
        if (data.gamePhase === 'playing') {
            roomRef.child('gamePhase').set('weak_claim').then(() => {
                roomRef.child('weakState').set({ weakPlayer: playerId, timestamp: Date.now() });
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
        if (!myTurn) btn.disabled = true;
        container.appendChild(btn);
    });
}

function drawMap(edgesOwner, players, gameMode) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allEdges.forEach(edge => {
        const u = nodePos[edge.u];
        const v = nodePos[edge.v];
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineWidth = 4;
        const owner = edgesOwner[edge.id];
        let color = '#b0bec5';
        if (owner) {
            const team = getTeamInfo(owner, gameMode);
            color = team.color;
        }
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = '#2c3e50';
        ctx.font = '12px monospace';
        ctx.fillText(edge.id, (u.x + v.x) / 2 - 15, (u.y + v.y) / 2 - 10);
    });
    for (let [node, pos] of Object.entries(nodePos)) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffe082';
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
    ALL_PLAYERS.forEach(p => {
        const start = players[p]?.start;
        if (start && nodePos[start]) {
            ctx.beginPath();
            ctx.arc(nodePos[start].x, nodePos[start].y, 26, 0, 2 * Math.PI);
            const team = getTeamInfo(p, gameMode);
            ctx.strokeStyle = team.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

function startGame() {
    if (!currentRoom || playerId !== 'player1') return;
    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        const data = snap.val();
        const activePlayers = getActivePlayers(data);
        if (activePlayers.length === 4) {
            database.ref(`rooms/${currentRoom}`).update({
                gamePhase: 'start',
                turn: activePlayers[0],
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        } else {
            alert('尚未集滿四位玩家，無法開始遊戲');
        }
    });
}

document.getElementById('edge-buttons-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.edge-button');
    if (!btn) return;
    if (!currentRoom || !myTurn) { alert('現在不是你的回合'); return; }
    const edgeId = btn.dataset.edgeId;
    if (!edgeId) return;
    database.ref(`rooms/${currentRoom}`).once('value').then(snap => {
        try {
            const data = snap.val();
            if (!data) { alert('房間資料不存在'); return; }
            if (data.gamePhase !== 'playing') { alert('遊戲不在進行中'); return; }
            const edgesOwner = data.edgesOwner || {};
            if (edgesOwner[edgeId]) { alert('這條邊已被佔'); return; }
            const playerPoints = getPlayerPointsFromData(playerId, data);
            const edge = allEdges.find(e => e.id === edgeId);
            if (!edge) return;
            if (!playerPoints.has(edge.u) && !playerPoints.has(edge.v)) {
                alert('你不能佔領這條邊：它與你的現有區域不相連');
                return;
            }
            let diceCount = 2, nextPlayer, score;
            const activePlayers = getActivePlayers(data);
            const currentIndex = activePlayers.indexOf(playerId);
            if (data.extraTurn && data.turn === playerId) {
                diceCount = data.extraDiceCount || 1;
                nextPlayer = data.extraTurnOriginalNext;
            } else {
                nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];
            }
            if (data.gameMode === 'party') {
                const promptMsg = data.extraTurn && data.turn === playerId
                    ? `請為線段 ${edgeId} 輸入一顆骰子點數 (1-6)：`
                    : `請為線段 ${edgeId} 輸入兩顆骰子總和 (2-12)：`;
                const input = prompt(promptMsg);
                if (input === null) return;
                score = parseInt(input, 10);
                if (isNaN(score)) { alert('請輸入有效的數字'); return; }
                if (data.extraTurn && data.turn === playerId) {
                    if (score < 1 || score > 6) { alert('請輸入 1-6 之間的數字'); return; }
                } else {
                    if (score < 2 || score > 12) { alert('請輸入 2-12 之間的數字'); return; }
                }
            } else {
                score = 0;
                for (let i = 0; i < diceCount; i++) score += Math.floor(Math.random() * 6) + 1;
            }
            const updates = {};
            updates[`edgesOwner/${edgeId}`] = playerId;
            updates[`edgesScore/${edgeId}`] = score;
            updates[`players/${playerId}/edges/${edgeId}`] = true;
            updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
            if (data.extraTurn && data.turn === playerId) {
                updates.extraTurn = null;
                updates.extraDiceCount = null;
                updates.extraTurnOriginalNext = null;
            }
            updates.turn = nextPlayer;
            const newOwnerCount = Object.keys(data.edgesOwner || {}).length + 1;
            if (newOwnerCount === TOTAL_EDGES) updates.gamePhase = 'ended';
            const history = saveHistory(data);
            updates.history = history;
            database.ref(`rooms/${currentRoom}`).update(updates).then(() => console.log('✅ 更新成功'));
        } catch (err) {
            console.error('❌ 錯誤', err);
            alert('發生錯誤：' + err.message);
        }
    }).catch(err => console.error('❌ 讀取失敗', err));
});

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

function exitRoom() {
    if (!currentRoom || !playerId) return;
    const roomRefLocal = firebase.database().ref(`rooms/${currentRoom}`);
    if (playerId === 'player1') {
        roomRefLocal.remove().then(() => handleRoomDeleted());
    } else {
        const updates = {};
        updates[`players/${playerId}/joined`] = false;
        updates.lastActive = firebase.database.ServerValue.TIMESTAMP;
        roomRefLocal.update(updates).then(() => {
            if (roomRef) roomRef.off();
            if (cleanupInterval) clearInterval(cleanupInterval);
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('waiting-room').style.display = 'none';
            document.getElementById('game-play-section').style.display = 'none';
            document.getElementById('result-section').style.display = 'none';
            currentRoom = null; playerId = null; roomRef = null;
        });
    }
}

function resetGame() {
    if (!currentRoom) return;
    const resetPlayers = {};
    ALL_PLAYERS.forEach((p, index) => {
        resetPlayers[p] = { start: null, edges: {}, joined: index === 0 };
    });
    database.ref(`rooms/${currentRoom}`).set({
        players: resetPlayers,
        turn: 'player1',
        gamePhase: 'waiting',
        gameMode: 'normal',
        edgesOwner: {},
        edgesScore: {},
        dices: [0, 0, 0],
        lastActive: firebase.database.ServerValue.TIMESTAMP,
        weakState: null,
        history: []
    });
}

function backToLobby() {
    document.getElementById('result-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    if (roomRef) { roomRef.off(); roomRef = null; }
    if (cleanupInterval) clearInterval(cleanupInterval);
    currentRoom = null; playerId = null;
}

function showResult(data) {
    const players = data.players;
    const edgesScore = data.edgesScore || {};
    const edgesOwner = data.edgesOwner || {};
    const activePlayers = getActivePlayers(data);
    const gameMode = data.gameMode || 'normal';

    const resultDiv = document.getElementById('result-players-info');
    if (resultDiv) {
        resultDiv.innerHTML = '';
        activePlayers.forEach(p => {
            const team = getTeamInfo(p, gameMode);
            const playerEdges = Object.keys(players[p]?.edges || {});
            const totalScore = playerEdges.reduce((sum, eid) => sum + (edgesScore[eid] || 0), 0);
            const div = document.createElement('div');
            div.className = 'result-player';
            div.innerHTML = `${team.name}: ${playerEdges.length} 條邊，總分 ${totalScore}`;
            resultDiv.appendChild(div);
        });
    }

    if (resultCtx) {
        resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        const drawEdges = allEdges.filter(edge => {
            if (gameMode === 'party') {
                if (playerId === 'player1') {
                    return true;
                } else {
                    return edgesOwner[edge.id] === playerId;
                }
            } else {
                return edgesOwner[edge.id] === playerId;
            }
        });
        drawEdges.forEach(edge => {
            const u = nodePos[edge.u], v = nodePos[edge.v];
            resultCtx.beginPath();
            resultCtx.moveTo(u.x, u.y);
            resultCtx.lineTo(v.x, v.y);
            resultCtx.lineWidth = 4;
            let color;
            if (gameMode === 'party' && playerId === 'player1') {
                if (edgesOwner[edge.id]) {
                    const team = getTeamInfo(edgesOwner[edge.id], gameMode);
                    color = team.color;
                } else {
                    color = '#b0bec5';
                }
            } else {
                const team = getTeamInfo(playerId, gameMode);
                color = team.color;
            }
            resultCtx.strokeStyle = color;
            resultCtx.stroke();
            const score = edgesScore[edge.id];
            if (score) {
                resultCtx.fillStyle = '#2c3e50';
                resultCtx.font = '12px monospace';
                resultCtx.fillText(`${edge.id}(${score})`, (u.x + v.x) / 2 - 15, (u.y + v.y) / 2 - 10);
            }
        });
        for (let [node, pos] of Object.entries(nodePos)) {
            resultCtx.beginPath();
            resultCtx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
            resultCtx.fillStyle = '#ffe082';
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
