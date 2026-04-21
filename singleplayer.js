// ---------- 四人輪流模式（熱座）手動輸入成本 + 弱勢方逆襲（分裂檢測） ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// 節點座標
const nodePos = {
    A: { x: 393, y: 96 }, B: { x: 140, y: 120 }, C: { x: 50, y: 371 },
    D: { x: 221, y: 371 }, E: { x: 393, y: 233 }, F: { x: 450, y: 417 },
    G: { x: 736, y: 600 }, H: { x: 564, y: 50 }, I: { x: 793, y: 417 },
    J: { x: 850, y: 142 }, K: { x: 621, y: 325 }, L: { x: 621, y: 600 },
    M: { x: 507, y: 508 }
};

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

// 隊伍資料
const teams = [
    { id: 0, name: '藍隊', color: '#3498db', start: null, edges: {}, edgeCount: 0, totalCost: 0 },
    { id: 1, name: '紅隊', color: '#e74c3c', start: null, edges: {}, edgeCount: 0, totalCost: 0 },
    { id: 2, name: '綠隊', color: '#2ecc71', start: null, edges: {}, edgeCount: 0, totalCost: 0 },
    { id: 3, name: '紫隊', color: '#9b59b6', start: null, edges: {}, edgeCount: 0, totalCost: 0 }
];

let currentTeamIndex = 0;
let gameOver = false;
let startSelectionPhase = true;
let extraTurn = false;
let extraTurnOriginalNext = null;

// 輔助函數：取得指定隊伍可到達的點
function getTeamPoints(team) {
    const points = new Set();
    if (team.start) points.add(team.start);
    Object.keys(team.edges).forEach(edgeId => {
        const edge = allEdges.find(e => e.id === edgeId);
        if (edge) {
            points.add(edge.u);
            points.add(edge.v);
        }
    });
    return points;
}

// 判斷搶佔該邊後，強勢方的剩餘邊是否會分成兩個以上各自有邊的連通分量（與聯機模式一致）
function wouldSplitPlayerGraph(team, edgeId) {
    const playerEdges = Object.keys(team.edges);
    if (!playerEdges.includes(edgeId)) return false;
    const remainingEdges = playerEdges.filter(eid => eid !== edgeId);
    if (remainingEdges.length === 0) return false;
    const adj = {};
    remainingEdges.forEach(eid => {
        const edge = allEdges.find(e => e.id === eid);
        if (edge) {
            if (!adj[edge.u]) adj[edge.u] = [];
            if (!adj[edge.v]) adj[edge.v] = [];
            adj[edge.u].push(edge.v);
            adj[edge.v].push(edge.u);
        }
    });
    const targetEdge = allEdges.find(e => e.id === edgeId);
    if (!targetEdge) return false;
    const start = targetEdge.u;
    const target = targetEdge.v;
    if (!adj[start] || !adj[target]) return false;
    const visited = new Set();
    const queue = [start];
    visited.add(start);
    while (queue.length) {
        const node = queue.shift();
        if (node === target) return false;
        (adj[node] || []).forEach(neighbor => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        });
    }
    return true;
}

// 生成可佔領的邊按鈕（一般佔邊）
function generateEdgeButtons() {
    const container = document.getElementById('edge-buttons-container');
    container.innerHTML = '';
    if (gameOver) return;
    const team = teams[currentTeamIndex];
    if (!team.start) return;
    const playerPoints = getTeamPoints(team);
    const occupiedEdges = new Set();
    teams.forEach(t => {
        Object.keys(t.edges).forEach(e => occupiedEdges.add(e));
    });
    const emptyEdges = allEdges.filter(edge => !occupiedEdges.has(edge.id));
    const availableEdges = emptyEdges.filter(edge => 
        playerPoints.has(edge.u) || playerPoints.has(edge.v)
    );
    
    // 無論普通回合或額外回合，只要沒有可佔邊，就進入弱勢申請
    if (availableEdges.length === 0) {
        showWeakClaimInterface();
        return;
    }
    
    availableEdges.forEach(edge => {
        const btn = document.createElement('button');
        btn.className = 'edge-button';
        btn.dataset.edgeId = edge.id;
        btn.textContent = edge.id;
        btn.addEventListener('click', () => {
            if (gameOver) return;
            let diceCount = 2;
            if (extraTurn) diceCount = 1;
            const promptMsg = extraTurn ? `請為線段 ${edge.id} 輸入一顆骰子點數 (1-6)：` : `請為線段 ${edge.id} 輸入兩顆骰子總和 (2-12)：`;
            const input = prompt(promptMsg);
            if (input === null) return;
            if (!/^\d+$/.test(input)) {
                alert('請輸入純數字');
                return;
            }
            const cost = parseInt(input, 10);
            if (isNaN(cost)) {
                alert('請輸入有效的數字');
                return;
            }
            if (extraTurn) {
                if (cost < 1 || cost > 6) {
                    alert('請輸入 1-6 之間的整數');
                    return;
                }
            } else {
                if (cost < 2 || cost > 12) {
                    alert('請輸入 2-12 之間的整數');
                    return;
                }
            }
            team.edges[edge.id] = cost;
            team.edgeCount++;
            team.totalCost += cost;
            updateUI();
            drawMap();
            if (extraTurn) {
                extraTurn = false;
                currentTeamIndex = extraTurnOriginalNext;
                extraTurnOriginalNext = null;
                updateUI();
                drawMap();
                generateEdgeButtons();
                document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 的回合，請選擇要佔領的邊`;
            } else {
                nextTurn();
            }
            const totalOccupied = teams.reduce((sum, t) => sum + Object.keys(t.edges).length, 0);
            if (totalOccupied === allEdges.length) {
                endGame();
            }
        });
        container.appendChild(btn);
    });
}

// 弱勢申請介面（使用分裂檢測）
function showWeakClaimInterface() {
    const team = teams[currentTeamIndex];
    const container = document.getElementById('edge-buttons-container');
    container.innerHTML = '<p>⚠️ 你已無邊可佔，進入弱勢申請階段</p>';
    const weakPoints = getTeamPoints(team);
    const candidateEdges = [];
    for (let t of teams) {
        if (t === team) continue;
        Object.keys(t.edges).forEach(edgeId => {
            const edge = allEdges.find(e => e.id === edgeId);
            if (edge && (weakPoints.has(edge.u) || weakPoints.has(edge.v))) {
                candidateEdges.push({ edgeId, ownerTeam: t });
            }
        });
    }
    // 只保留不會導致對方圖形分裂的邊
    const strongEdges = candidateEdges.filter(item => !wouldSplitPlayerGraph(item.ownerTeam, item.edgeId));
    if (strongEdges.length === 0) {
        container.innerHTML = '<p>⚠️ 沒有可申請的邊（所有相鄰邊都會使對方圖形分裂），無法繼續遊戲。請按「重啟遊戲」。</p>';
        return;
    }
    strongEdges.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'claim-button';
        btn.textContent = item.edgeId;
        btn.addEventListener('click', () => {
            const edge = allEdges.find(e => e.id === item.edgeId);
            if (!edge) return;
            const input = prompt(`請為線段 ${item.edgeId} 輸入三顆骰子總和 (3-18)：`);
            if (input === null) return;
            if (!/^\d+$/.test(input)) {
                alert('請輸入純數字');
                return;
            }
            const cost = parseInt(input, 10);
            if (isNaN(cost) || cost < 3 || cost > 18) {
                alert('請輸入 3-18 之間的整數');
                return;
            }
            // 弱勢方獲得該邊
            team.edges[item.edgeId] = cost;
            team.edgeCount++;
            team.totalCost += cost;
            // 從原擁有者移除
            delete item.ownerTeam.edges[item.edgeId];
            item.ownerTeam.edgeCount--;
            item.ownerTeam.totalCost -= cost;
            // 被佔方獲得額外回合
            extraTurn = true;
            extraTurnOriginalNext = (currentTeamIndex + 1) % 4;
            currentTeamIndex = teams.findIndex(t => t === item.ownerTeam);
            updateUI();
            drawMap();
            generateEdgeButtons();
            document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 獲得額外回合，請選擇要佔領的邊（只需一顆骰子）`;
        });
        container.appendChild(btn);
    });
}

function updateUI() {
    for (let i = 0; i < teams.length; i++) {
        const t = teams[i];
        document.getElementById(`p${i+1}-edges`).textContent = t.edgeCount;
        document.getElementById(`p${i+1}-cost`).textContent = t.totalCost;
        document.getElementById(`p${i+1}-start`).textContent = t.start || '-';
        const card = document.getElementById(`player${i+1}-card`);
        if (i === currentTeamIndex && !gameOver) {
            card.classList.add('current-turn');
        } else {
            card.classList.remove('current-turn');
        }
    }
    if (startSelectionPhase) {
        document.getElementById('turn-indicator').textContent = `起點選擇階段：${teams[currentTeamIndex].name} 請選擇起點`;
    } else if (extraTurn) {
        document.getElementById('turn-indicator').textContent = `額外回合：${teams[currentTeamIndex].name}`;
    } else {
        document.getElementById('turn-indicator').textContent = `當前回合：${teams[currentTeamIndex].name}`;
    }
}

function nextTurn() {
    if (gameOver) return;
    if (startSelectionPhase) {
        currentTeamIndex = (currentTeamIndex + 1) % 4;
        const allStartsSelected = teams.every(t => t.start !== null);
        if (allStartsSelected) {
            document.getElementById('start-point-selection').style.display = 'none';
            startSelectionPhase = false;
            currentTeamIndex = 0;
            updateUI();
            drawMap();
            generateEdgeButtons();
            document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 的回合，請選擇要佔領的邊`;
        } else {
            updateUI();
            document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 請選擇你的起點`;
        }
    } else {
        currentTeamIndex = (currentTeamIndex + 1) % 4;
        updateUI();
        drawMap();
        generateEdgeButtons();
        document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 的回合，請選擇要佔領的邊`;
    }
}

function endGame() {
    gameOver = true;
    const sorted = [...teams].sort((a,b) => b.totalCost - a.totalCost);
    let rankingMsg = '🎉 遊戲結束！最終排名 🎉\n';
    sorted.forEach((t, idx) => {
        rankingMsg += `${idx+1}. ${t.name} : 總成本 ${t.totalCost} (${t.edgeCount} 條邊)\n`;
    });
    // 不彈窗，僅在 game-status 區域顯示
    document.getElementById('game-status').innerHTML = rankingMsg.replace(/\n/g, '<br>');
    document.getElementById('edge-buttons-container').innerHTML = '<p>遊戲已結束</p>';
    // 不再呼叫 alert
}

function resetGame() {
    teams.forEach(t => {
        t.start = null;
        t.edges = {};
        t.edgeCount = 0;
        t.totalCost = 0;
    });
    currentTeamIndex = 0;
    gameOver = false;
    startSelectionPhase = true;
    extraTurn = false;
    extraTurnOriginalNext = null;
    document.getElementById('start-point-selection').style.display = 'block';
    updateUI();
    drawMap();
    document.getElementById('edge-buttons-container').innerHTML = '<p>請先完成所有隊伍的起點選擇</p>';
    document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 請選擇你的起點`;
}

// 繪製地圖
function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allEdges.forEach(edge => {
        const u = nodePos[edge.u];
        const v = nodePos[edge.v];
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineWidth = 4;
        let owner = null;
        for (let t of teams) {
            if (t.edges[edge.id]) {
                owner = t;
                break;
            }
        }
        if (owner) {
            ctx.strokeStyle = owner.color;
        } else {
            ctx.strokeStyle = '#b0bec5';
        }
        ctx.stroke();
        if (owner && owner.edges[edge.id] !== undefined) {
            const cost = owner.edges[edge.id];
            const midX = (u.x + v.x) / 2;
            const midY = (u.y + v.y) / 2;
            ctx.beginPath();
            ctx.arc(midX, midY, 12, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cost, midX, midY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    });
    for (let [node, pos] of Object.entries(nodePos)) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffe082';
        ctx.fill();
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(node, pos.x-8, pos.y+6);
    }
    teams.forEach(t => {
        if (t.start && nodePos[t.start]) {
            ctx.beginPath();
            ctx.arc(nodePos[t.start].x, nodePos[t.start].y, 26, 0, 2 * Math.PI);
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([5,5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

// 初始化起點按鈕
function initStartButtons() {
    const container = document.getElementById('node-buttons');
    container.innerHTML = '';
    for (let i = 0; i < 13; i++) {
        const node = String.fromCharCode(65 + i);
        const btn = document.createElement('button');
        btn.textContent = node;
        btn.addEventListener('click', () => {
            if (gameOver) return;
            if (!startSelectionPhase) {
                alert('起點選擇階段已結束，無法再選起點。如需重新開始，請按「重啟遊戲」。');
                return;
            }
            const team = teams[currentTeamIndex];
            if (team.start === null) {
                team.start = node;
                updateUI();
                drawMap();
                nextTurn();
            } else {
                alert('此隊伍已選過起點，請等待其他隊伍選完');
            }
        });
        container.appendChild(btn);
    }
}

// 返回主選單
document.getElementById('back-to-menu-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});
document.getElementById('reset-game-btn').addEventListener('click', resetGame);

// 初始化
initStartButtons();
drawMap();
updateUI();
document.getElementById('edge-buttons-container').innerHTML = '<p>請先完成所有隊伍的起點選擇</p>';
document.getElementById('game-status').innerHTML = `${teams[currentTeamIndex].name} 請選擇你的起點`;