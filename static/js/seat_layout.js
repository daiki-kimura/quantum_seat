/**
 * 会場レイアウト - Canvas描画（受付画面・編集画面で共有）と編集機能
 *
 * レイアウトのデータ形式:
 *   tables: [
 *     {id, shape: 'rect' | 'ellipse', x, y, w, h}   (x, y は中心座標。ellipse は w=h で円)
 *     {id, shape: 'polygon', points: [{x, y}, ...]}   (頂点は3つ以上)
 *   ]
 *   seats:  [{id, x, y, label}]
 */

const CANVAS_W = 800;
const CANVAS_H = 600;

const SEAT_RADIUS = 22;
const SEAT_COLOR = '#0f62fe';
const SEAT_SELECTED_COLOR = '#78a9ff';
const SEAT_OCCUPIED_COLOR = '#8a3ffc';
const SEAT_HIGHLIGHT_COLOR = '#f1c21b';
// 抽選アニメーション用（IBMのteal）
const QUANTUM_COLOR = '#08bdba';
const QUANTUM_RGB = '8, 189, 186';

const TABLE_COLOR = '#393939';
const TABLE_SELECTED_COLOR = '#4c4c4c';
const TABLE_STROKE_COLOR = '#6f6f6f';
const TABLE_SELECTED_STROKE_COLOR = '#78a9ff';
const CANVAS_BG_COLOR = '#161616';
const CANVAS_GRID_COLOR = '#262626';
const CANVAS_TEXT_COLOR = '#f4f4f4';
const CANVAS_FONT = '"IBM Plex Sans", "Hiragino Sans", "Noto Sans JP", sans-serif';

const DEFAULT_RECT_SIZE = { w: 160, h: 80 };
const DEFAULT_ELLIPSE_SIZE = { w: 140, h: 140 };
const MIN_TABLE_SIZE = 20;
const MAX_TABLE_SIZE = 800;
const MAX_POLYGON_POINTS = 50;

// クリックとドラッグを区別するしきい値（px）
const CLICK_THRESHOLD = 8;
// 多角形の始点に近づいたら閉じる距離（px）
const POLYGON_CLOSE_DISTANCE = 12;
// 同じ位置の連続クリック（ダブルクリック）を無視する距離（px）
const POLYGON_MIN_SEGMENT = 4;

/** 机の輪郭をパスとして構築する */
function buildTablePath(ctx, table) {
    ctx.beginPath();
    if (table.shape === 'ellipse') {
        ctx.ellipse(table.x, table.y, table.w / 2, table.h / 2, 0, 0, Math.PI * 2);
    } else if (table.shape === 'polygon') {
        table.points.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
    } else {
        ctx.rect(table.x - table.w / 2, table.y - table.h / 2, table.w, table.h);
    }
}

/** 描画中のプレビュー（ドラッグ中の四角・丸、作図中の多角形）を描く */
function drawPreview(ctx, preview) {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 169, 255, 0.2)';
    ctx.strokeStyle = TABLE_SELECTED_STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    if (preview.type === 'box') {
        buildTablePath(ctx, preview);
        ctx.fill();
        ctx.stroke();
    } else if (preview.type === 'polygon' && preview.points.length > 0) {
        const pts = preview.points;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (preview.cursor) ctx.lineTo(preview.cursor.x, preview.cursor.y);
        if (pts.length >= 3) {
            ctx.closePath();
            ctx.fill();
        }
        ctx.stroke();

        // 頂点（始点は閉じられることが分かるよう大きく）
        ctx.setLineDash([]);
        pts.forEach((pt, i) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, i === 0 ? 7 : 4, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? '#fa4d56' : TABLE_SELECTED_STROKE_COLOR;
            ctx.fill();
        });
    }
    ctx.restore();
}

/**
 * 会場を描画する
 * @param {HTMLCanvasElement} canvas
 * @param {{tables: Array, seats: Array}} layout
 * @param {{names?: Map<number,string>, highlightSeatId?: number|null,
 *          selected?: {type: string, id: number}|null, preview?: object|null,
 *          scanSeatId?: number|null, superposition?: number|null,
 *          ripple?: {seatId: number, t: number}|null}} [options]
 *   names: 席ID -> 着席者名
 *   scanSeatId: 抽選アニメーションで走査中の席 / superposition: 空席の脈動の位相（ラジアン）
 *   ripple: 決定した席から広がる波紋（t: 0〜1）
 */
function drawVenue(canvas, layout, options) {
    const opts = options || {};
    const names = opts.names || new Map();
    const selected = opts.selected || null;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = CANVAS_BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // グリッド
    ctx.strokeStyle = CANVAS_GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // 机
    layout.tables.forEach(table => {
        const isSelected = selected && selected.type === 'table' && selected.id === table.id;
        ctx.fillStyle = isSelected ? TABLE_SELECTED_COLOR : TABLE_COLOR;
        ctx.strokeStyle = isSelected ? TABLE_SELECTED_STROKE_COLOR : TABLE_STROKE_COLOR;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        buildTablePath(ctx, table);
        ctx.fill();
        ctx.stroke();
    });

    // 作図中のプレビュー（机の上・座席の下）
    if (opts.preview) drawPreview(ctx, opts.preview);

    // 座席
    layout.seats.forEach(seat => {
        const isSelected = selected && selected.type === 'seat' && selected.id === seat.id;
        const isHighlight = opts.highlightSeatId === seat.id;
        const occupied = names.has(seat.id);

        let color = SEAT_COLOR;
        if (occupied) color = SEAT_OCCUPIED_COLOR;
        if (isSelected) color = SEAT_SELECTED_COLOR;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(seat.x, seat.y, SEAT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isHighlight ? SEAT_HIGHLIGHT_COLOR : CANVAS_BG_COLOR;
        ctx.lineWidth = isHighlight ? 6 : 3;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `600 16px ${CANVAS_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(seat.label), seat.x, seat.y);

        if (occupied) {
            // 背景色の縁付きで名前を描画（机の上でも読めるように）
            ctx.font = `500 14px ${CANVAS_FONT}`;
            ctx.lineWidth = 4;
            ctx.strokeStyle = CANVAS_BG_COLOR;
            ctx.strokeText(names.get(seat.id), seat.x, seat.y + SEAT_RADIUS + 12);
            ctx.fillStyle = CANVAS_TEXT_COLOR;
            ctx.fillText(names.get(seat.id), seat.x, seat.y + SEAT_RADIUS + 12);
        }
    });

    drawDrawEffects(ctx, layout, names, opts);
}

/** 抽選アニメーションの演出（空席の脈動・走査リング・決定時の波紋） */
function drawDrawEffects(ctx, layout, names, opts) {
    ctx.save();
    ctx.lineWidth = 2;

    // 重ね合わせ: 空席がすべて同時に存在するように脈動する
    if (typeof opts.superposition === 'number') {
        layout.seats.forEach(seat => {
            if (names.has(seat.id)) return;
            const alpha = 0.25 + 0.25 * Math.sin(opts.superposition + seat.id * 1.7);
            ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(seat.x, seat.y, SEAT_RADIUS + 5, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    // 走査リング（ビンゴの玉のように次々と移る）
    const scan = opts.scanSeatId == null ? null : layout.seats.find(s => s.id === opts.scanSeatId);
    if (scan) {
        ctx.shadowColor = QUANTUM_COLOR;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = QUANTUM_COLOR;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(scan.x, scan.y, SEAT_RADIUS + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // 観測の波紋（収縮の瞬間に外へ広がる）
    const ripple = opts.ripple ? layout.seats.find(s => s.id === opts.ripple.seatId) : null;
    if (ripple) {
        ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
            const p = opts.ripple.t - k * 0.18;
            if (p <= 0 || p >= 1) continue;
            ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${(1 - p) * 0.9})`;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, SEAT_RADIUS + 8 + p * 90, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.restore();
}

/**
 * レイアウト編集機能
 *
 * ツール:
 *   select  : 選択・移動
 *   rect    : ドラッグで四角形を描く（Shiftで正方形、クリックのみで既定サイズ）
 *   ellipse : ドラッグで丸（楕円）を描く（Shiftで正円、クリックのみで既定サイズ）
 *   polygon : クリックで頂点を打つ。始点クリック／ダブルクリック／Enterで確定
 *   seat    : クリックで席を置く
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   getLayout: () => {tables: Array, seats: Array},
 *   getAssignedSeatIds: () => Set<number>,
 *   onChange: () => void,          // レイアウトが確定的に変わった（保存＋再描画）
 *   redraw: () => void,            // 再描画のみ（ドラッグ中・作図中など）
 *   onSelectionChange?: () => void
 * }} hooks
 */
function createLayoutEditor(canvas, hooks) {
    let tool = 'select';
    let selected = null;   // {type: 'seat' | 'table', id}
    let drag = null;       // 移動中: {type, id, ...}
    let boxDraw = null;    // 四角・丸の作図中: {shape, start, cur}
    let polyDraw = null;   // 多角形の作図中: {points: [...], cursor}

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function toCanvasPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: clamp((e.clientX - rect.left) * canvas.width / rect.width, 0, CANVAS_W),
            y: clamp((e.clientY - rect.top) * canvas.height / rect.height, 0, CANVAS_H)
        };
    }

    function pointInPolygon(p, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if ((a.y > p.y) !== (b.y > p.y) &&
                p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
                inside = !inside;
            }
        }
        return inside;
    }

    function tableContains(t, p) {
        if (t.shape === 'polygon') return pointInPolygon(p, t.points);
        const dx = p.x - t.x, dy = p.y - t.y;
        if (t.shape === 'ellipse') {
            const rx = t.w / 2, ry = t.h / 2;
            return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
        }
        return Math.abs(dx) <= t.w / 2 && Math.abs(dy) <= t.h / 2;
    }

    function findSeatAt(p) {
        const seats = hooks.getLayout().seats;
        for (let i = seats.length - 1; i >= 0; i--) {
            if (Math.hypot(p.x - seats[i].x, p.y - seats[i].y) <= SEAT_RADIUS) return seats[i];
        }
        return null;
    }

    function findTableAt(p) {
        const tables = hooks.getLayout().tables;
        for (let i = tables.length - 1; i >= 0; i--) {
            if (tableContains(tables[i], p)) return tables[i];
        }
        return null;
    }

    function nextId(items) {
        return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    }

    // 未使用の最小の席番号
    function nextSeatLabel() {
        const used = new Set(hooks.getLayout().seats.map(s => s.label));
        let label = 1;
        while (used.has(label)) label++;
        return label;
    }

    function select(type, id) {
        selected = type ? { type, id } : null;
        if (hooks.onSelectionChange) hooks.onSelectionChange();
    }

    function addTable(table) {
        const layout = hooks.getLayout();
        table.id = nextId(layout.tables);
        layout.tables.push(table);
        select('table', table.id);
        hooks.onChange();
    }

    function placeSeat(p) {
        const layout = hooks.getLayout();
        const seat = {
            id: nextId(layout.seats),
            x: clamp(Math.round(p.x), SEAT_RADIUS, CANVAS_W - SEAT_RADIUS),
            y: clamp(Math.round(p.y), SEAT_RADIUS, CANVAS_H - SEAT_RADIUS),
            label: nextSeatLabel()
        };
        layout.seats.push(seat);
        select('seat', seat.id);
        hooks.onChange();
    }

    // ---- 四角・丸（ドラッグ） ----

    function boxFromDraw(draw, keepSquare) {
        let dx = draw.cur.x - draw.start.x;
        let dy = draw.cur.y - draw.start.y;
        if (keepSquare) {
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            dx = Math.sign(dx || 1) * size;
            dy = Math.sign(dy || 1) * size;
        }
        return {
            type: 'box',
            shape: draw.shape,
            x: Math.round(draw.start.x + dx / 2),
            y: Math.round(draw.start.y + dy / 2),
            w: Math.max(Math.round(Math.abs(dx)), MIN_TABLE_SIZE),
            h: Math.max(Math.round(Math.abs(dy)), MIN_TABLE_SIZE)
        };
    }

    function finishBoxDraw(keepSquare) {
        const draw = boxDraw;
        boxDraw = null;
        const moved = Math.hypot(draw.cur.x - draw.start.x, draw.cur.y - draw.start.y);

        if (moved < CLICK_THRESHOLD) {
            // クリックのみ: 既定サイズで置く
            const size = draw.shape === 'rect' ? DEFAULT_RECT_SIZE : DEFAULT_ELLIPSE_SIZE;
            addTable({
                shape: draw.shape,
                x: Math.round(draw.start.x),
                y: Math.round(draw.start.y),
                w: size.w,
                h: size.h
            });
            return;
        }
        const box = boxFromDraw(draw, keepSquare);
        addTable({ shape: box.shape, x: box.x, y: box.y, w: box.w, h: box.h });
    }

    // ---- 多角形（頂点クリック） ----

    function addPolygonPoint(p) {
        if (!polyDraw) polyDraw = { points: [], cursor: null };
        const pts = polyDraw.points;

        // 始点に近ければ閉じる
        if (pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= POLYGON_CLOSE_DISTANCE) {
            finishPolygon();
            return;
        }
        // ダブルクリックで同じ位置に二重に打たれるのを防ぐ
        const last = pts[pts.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < POLYGON_MIN_SEGMENT) return;
        if (pts.length >= MAX_POLYGON_POINTS) return;

        pts.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }

    /** 多角形を確定する。頂点が足りない場合はメッセージを返す */
    function finishPolygon() {
        if (!polyDraw) return null;
        if (polyDraw.points.length < 3) return '多角形には3つ以上の頂点が必要です';
        const points = polyDraw.points;
        polyDraw = null;
        addTable({ shape: 'polygon', points });
        return null;
    }

    function cancelDrawing() {
        boxDraw = null;
        polyDraw = null;
        hooks.redraw();
    }

    // ---- ポインター操作 ----

    function onPointerDown(e) {
        const p = toCanvasPoint(e);

        if (tool === 'polygon') {
            addPolygonPoint(p);
            hooks.redraw();
            return;
        }

        if (tool === 'rect' || tool === 'ellipse') {
            boxDraw = { shape: tool, start: p, cur: p };
            canvas.setPointerCapture(e.pointerId);
            hooks.redraw();
            return;
        }

        const seat = findSeatAt(p);
        const table = seat ? null : findTableAt(p);

        if (seat) {
            select('seat', seat.id);
            drag = { type: 'seat', id: seat.id, dx: p.x - seat.x, dy: p.y - seat.y, moved: false };
        } else if (tool === 'seat') {
            placeSeat(p);
        } else if (table) {
            select('table', table.id);
            drag = {
                type: 'table', id: table.id, start: p, moved: false,
                // 移動開始時の形状を保存し、そこからの差分で動かす
                origin: JSON.parse(JSON.stringify(table))
            };
        } else {
            select(null);
        }

        if (drag) canvas.setPointerCapture(e.pointerId);
        hooks.redraw();
    }

    function moveTable(table, origin, delta) {
        if (table.shape === 'polygon') {
            const xs = origin.points.map(pt => pt.x);
            const ys = origin.points.map(pt => pt.y);
            // 図形全体がキャンバス内に収まるよう移動量を制限
            const dx = clamp(delta.x, -Math.min(...xs), CANVAS_W - Math.max(...xs));
            const dy = clamp(delta.y, -Math.min(...ys), CANVAS_H - Math.max(...ys));
            table.points = origin.points.map(pt => ({ x: Math.round(pt.x + dx), y: Math.round(pt.y + dy) }));
        } else {
            table.x = clamp(Math.round(origin.x + delta.x), 0, CANVAS_W);
            table.y = clamp(Math.round(origin.y + delta.y), 0, CANVAS_H);
        }
    }

    function onPointerMove(e) {
        const p = toCanvasPoint(e);

        if (boxDraw) {
            boxDraw.cur = p;
            boxDraw.square = e.shiftKey;
            hooks.redraw();
            return;
        }
        if (polyDraw) {
            polyDraw.cursor = p;
            hooks.redraw();
            return;
        }
        if (!drag) return;

        const layout = hooks.getLayout();
        if (drag.type === 'seat') {
            const seat = layout.seats.find(s => s.id === drag.id);
            if (!seat) return;
            seat.x = clamp(Math.round(p.x - drag.dx), SEAT_RADIUS, CANVAS_W - SEAT_RADIUS);
            seat.y = clamp(Math.round(p.y - drag.dy), SEAT_RADIUS, CANVAS_H - SEAT_RADIUS);
        } else {
            const table = layout.tables.find(t => t.id === drag.id);
            if (!table) return;
            moveTable(table, drag.origin, { x: p.x - drag.start.x, y: p.y - drag.start.y });
        }
        drag.moved = true;
        hooks.redraw();
    }

    function onPointerUp(e) {
        if (boxDraw) {
            boxDraw.cur = toCanvasPoint(e);
            finishBoxDraw(e.shiftKey);
            return;
        }
        if (drag && drag.moved) hooks.onChange();
        drag = null;
    }

    function onPointerCancel() {
        if (boxDraw) {
            cancelDrawing();
            return;
        }
        if (drag && drag.moved) hooks.onChange();
        drag = null;
    }

    function onDoubleClick() {
        // ダブルクリックで多角形を確定（最初のクリックで頂点は打たれている）
        if (tool === 'polygon' && polyDraw && polyDraw.points.length >= 3) {
            finishPolygon();
            hooks.redraw();
        }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('dblclick', onDoubleClick);

    return {
        setTool(name) {
            // 作図途中の図形は破棄する
            boxDraw = null;
            polyDraw = null;
            tool = name;
            hooks.redraw();
        },

        getSelected() {
            return selected;
        },

        clearSelection() {
            select(null);
        },

        isDrawingPolygon() {
            return polyDraw !== null && polyDraw.points.length > 0;
        },

        /** 作図中のプレビュー情報（なければnull） */
        getPreview() {
            if (boxDraw) {
                return boxFromDraw(boxDraw, boxDraw.square);
            }
            if (polyDraw && polyDraw.points.length > 0) {
                return { type: 'polygon', points: polyDraw.points, cursor: polyDraw.cursor };
            }
            return null;
        },

        /** 多角形を確定する。失敗時は理由メッセージを返す */
        finishPolygon() {
            const message = finishPolygon();
            hooks.redraw();
            return message;
        },

        cancelDrawing,

        /**
         * キー操作を処理する。処理した場合はtrueを返す
         *   Enter: 多角形を確定 / Escape: 作図を取消 / Backspace・Delete: 直前の頂点を削除
         */
        handleKey(event) {
            if (boxDraw && event.key === 'Escape') {
                cancelDrawing();
                return true;
            }
            if (!polyDraw || polyDraw.points.length === 0) return false;

            if (event.key === 'Enter') {
                finishPolygon();
                hooks.redraw();
                return true;
            }
            if (event.key === 'Escape') {
                cancelDrawing();
                return true;
            }
            if (event.key === 'Backspace' || event.key === 'Delete') {
                polyDraw.points.pop();
                if (polyDraw.points.length === 0) polyDraw = null;
                hooks.redraw();
                return true;
            }
            return false;
        },

        /** 選択中の席または机を削除する。失敗時は理由メッセージを返す */
        deleteSelected() {
            if (!selected) return null;
            const layout = hooks.getLayout();

            if (selected.type === 'seat') {
                if (hooks.getAssignedSeatIds().has(selected.id)) {
                    return '着席中の席は削除できません。先に受付一覧から取り消してください';
                }
                layout.seats = layout.seats.filter(s => s.id !== selected.id);
            } else {
                layout.tables = layout.tables.filter(t => t.id !== selected.id);
            }
            select(null);
            hooks.onChange();
            return null;
        },

        /** 選択中の机の大きさを変更する。変更できない場合はメッセージを返す */
        resizeSelected(factor) {
            if (!selected || selected.type !== 'table') return null;
            const table = hooks.getLayout().tables.find(t => t.id === selected.id);
            if (!table) return null;

            if (table.shape === 'polygon') {
                const n = table.points.length;
                const cx = table.points.reduce((s, pt) => s + pt.x, 0) / n;
                const cy = table.points.reduce((s, pt) => s + pt.y, 0) / n;
                const scaled = table.points.map(pt => ({
                    x: Math.round(cx + (pt.x - cx) * factor),
                    y: Math.round(cy + (pt.y - cy) * factor)
                }));
                if (scaled.some(pt => pt.x < 0 || pt.x > CANVAS_W || pt.y < 0 || pt.y > CANVAS_H)) {
                    return 'これ以上大きくできません（キャンバスの外に出ます）';
                }
                table.points = scaled;
            } else {
                table.w = clamp(Math.round(table.w * factor), MIN_TABLE_SIZE, MAX_TABLE_SIZE);
                table.h = clamp(Math.round(table.h * factor), MIN_TABLE_SIZE, MAX_TABLE_SIZE);
            }
            hooks.onChange();
            return null;
        }
    };
}

// Made with Bob
