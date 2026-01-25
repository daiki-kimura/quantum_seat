/**
 * 座席配置GUI - Canvas操作とドラッグ&ドロップ機能
 */

// グローバル変数
let canvas, ctx;
let seats = [];
let selectedSeat = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let nextSeatId = 1;

// 座席のデフォルト設定
const SEAT_RADIUS = 25;
const SEAT_COLOR = '#667eea';
const SEAT_SELECTED_COLOR = '#764ba2';
const SEAT_TEXT_COLOR = '#ffffff';

/**
 * キャンバスの初期化
 */
function initCanvas() {
    canvas = document.getElementById('seat-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');

    // イベントリスナーを設定
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('dblclick', handleDoubleClick);

    // 初期描画
    drawCanvas();
}

/**
 * キャンバスを描画
 */
function drawCanvas() {
    if (!ctx) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景を描画
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // グリッド線を描画
    drawGrid();

    // すべての座席を描画
    seats.forEach(seat => {
        drawSeat(seat);
    });

    // 座席数を更新
    updateSeatCount();
}

/**
 * グリッド線を描画
 */
function drawGrid() {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // 縦線
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // 横線
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

/**
 * 座席を描画
 */
function drawSeat(seat) {
    const isSelected = selectedSeat && selectedSeat.id === seat.id;
    const color = isSelected ? SEAT_SELECTED_COLOR : SEAT_COLOR;

    // 座席の円を描画
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(seat.x, seat.y, SEAT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // 枠線を描画
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 座席番号を描画
    ctx.fillStyle = SEAT_TEXT_COLOR;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seat.label, seat.x, seat.y);
}

/**
 * マウスダウンイベント
 */
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // クリックされた座席を探す
    selectedSeat = findSeatAt(x, y);

    if (selectedSeat) {
        isDragging = true;
        dragOffset.x = x - selectedSeat.x;
        dragOffset.y = y - selectedSeat.y;
    }

    drawCanvas();
}

/**
 * マウス移動イベント
 */
function handleMouseMove(e) {
    if (!isDragging || !selectedSeat) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 座席の位置を更新（キャンバス内に制限）
    selectedSeat.x = Math.max(SEAT_RADIUS, Math.min(canvas.width - SEAT_RADIUS, x - dragOffset.x));
    selectedSeat.y = Math.max(SEAT_RADIUS, Math.min(canvas.height - SEAT_RADIUS, y - dragOffset.y));

    drawCanvas();
}

/**
 * マウスアップイベント
 */
function handleMouseUp(e) {
    isDragging = false;
}

/**
 * ダブルクリックイベント（座席削除）
 */
function handleDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const seat = findSeatAt(x, y);
    if (seat) {
        if (confirm(`座席 ${seat.label} を削除しますか？`)) {
            seats = seats.filter(s => s.id !== seat.id);
            selectedSeat = null;
            drawCanvas();
        }
    }
}

/**
 * 指定座標の座席を探す
 */
function findSeatAt(x, y) {
    for (let i = seats.length - 1; i >= 0; i--) {
        const seat = seats[i];
        const distance = Math.sqrt(Math.pow(x - seat.x, 2) + Math.pow(y - seat.y, 2));
        if (distance <= SEAT_RADIUS) {
            return seat;
        }
    }
    return null;
}

/**
 * 座席を追加
 */
function addSeat() {
    const seat = {
        id: nextSeatId++,
        x: 100 + (seats.length % 8) * 80,
        y: 100 + Math.floor(seats.length / 8) * 80,
        label: seats.length + 1
    };

    seats.push(seat);
    drawCanvas();
}

/**
 * すべての座席をクリア
 */
function clearSeats() {
    if (seats.length === 0) return;

    if (confirm('すべての座席を削除しますか？')) {
        seats = [];
        selectedSeat = null;
        nextSeatId = 1;
        drawCanvas();
    }
}

/**
 * プリセット配置を読み込む
 */
function loadPreset(type) {
    if (seats.length > 0) {
        if (!confirm('現在の座席配置を上書きしますか？')) {
            return;
        }
    }

    seats = [];
    nextSeatId = 1;

    const count = parseInt(document.getElementById('participant-count').value);

    switch (type) {
        case 'table':
            loadTablePreset(count);
            break;
        case 'circle':
            loadCirclePreset(count);
            break;
    }

    drawCanvas();
}

/**
 * テーブル配置プリセット
 */
function loadTablePreset(count) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const spacingX = (canvas.width - 100) / (cols + 1);
    const spacingY = (canvas.height - 100) / (rows + 1);

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        seats.push({
            id: nextSeatId++,
            x: 50 + spacingX * (col + 1),
            y: 50 + spacingY * (row + 1),
            label: i + 1
        });
    }
}

/**
 * 円形配置プリセット
 */
function loadCirclePreset(count) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 80;

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;

        seats.push({
            id: nextSeatId++,
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            label: i + 1
        });
    }
}

/**
 * 座席数を更新
 */
function updateSeatCount() {
    const countElement = document.getElementById('seat-count');
    if (countElement) {
        countElement.textContent = seats.length;
    }
}

/**
 * 座席データを取得
 */
function getSeats() {
    return seats.map(seat => ({
        id: seat.id,
        x: seat.x,
        y: seat.y,
        label: seat.label
    }));
}

/**
 * 結果キャンバスに描画
 */
function drawResultCanvas(assignments) {
    const resultCanvas = document.getElementById('result-canvas');
    if (!resultCanvas) return;

    const resultCtx = resultCanvas.getContext('2d');

    // キャンバスをクリア
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    // 背景を描画
    resultCtx.fillStyle = '#f8f9fa';
    resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

    // グリッド線を描画
    resultCtx.strokeStyle = '#e0e0e0';
    resultCtx.lineWidth = 1;

    for (let x = 0; x < resultCanvas.width; x += 50) {
        resultCtx.beginPath();
        resultCtx.moveTo(x, 0);
        resultCtx.lineTo(x, resultCanvas.height);
        resultCtx.stroke();
    }

    for (let y = 0; y < resultCanvas.height; y += 50) {
        resultCtx.beginPath();
        resultCtx.moveTo(0, y);
        resultCtx.lineTo(resultCanvas.width, y);
        resultCtx.stroke();
    }

    // 割り当てられた座席を描画
    assignments.forEach((assignment, index) => {
        const seat = assignment.seat;

        // 座席の円を描画
        resultCtx.fillStyle = '#667eea';
        resultCtx.beginPath();
        resultCtx.arc(seat.x, seat.y, SEAT_RADIUS, 0, Math.PI * 2);
        resultCtx.fill();

        // 枠線を描画
        resultCtx.strokeStyle = '#ffffff';
        resultCtx.lineWidth = 3;
        resultCtx.stroke();

        // 座席番号を描画
        resultCtx.fillStyle = '#ffffff';
        resultCtx.font = 'bold 14px Arial';
        resultCtx.textAlign = 'center';
        resultCtx.textBaseline = 'middle';
        resultCtx.fillText(seat.label, seat.x, seat.y);

        // 参加者名を描画
        resultCtx.fillStyle = '#333';
        resultCtx.font = 'bold 12px Arial';
        resultCtx.fillText(assignment.participant, seat.x, seat.y + SEAT_RADIUS + 15);
    });
}

// Made with Bob
