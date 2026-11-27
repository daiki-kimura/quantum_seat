/**
 * 会場レイアウト - Canvas描画（受付画面・編集画面で共有）と編集機能
 *
 * レイアウトのデータ形式:
 *   tables: [
 *     {id, shape: 'rect' | 'ellipse', x, y, w, h}   (x, y は中心座標。ellipse は w=h で円)
 *     {id, shape: 'polygon', points: [{x, y}, ...]}   (頂点は3つ以上)
 *   ]
 *   seats:  [{id, x, y, label}]
 *   annotations: [   (会場図への書き込み。省略可)
 *     {id, type: 'text', x, y, text, size}            (x, y は文字の中心)
 *     {id, type: 'arrow', x1, y1, x2, y2}             ((x2, y2) が矢じり側)
 *     {id, type: 'line', x1, y1, x2, y2}              (矢じりのない線)
 *   ]
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

// 会場図への書き込み（文字・矢印）。上限はサーバー側の検証と合わせる
const MAX_ANNOTATIONS = 100;
const MAX_ANNOTATION_TEXT = 50;
const MIN_TEXT_SIZE = 10;
const MAX_TEXT_SIZE = 96;
const DEFAULT_TEXT_SIZE = 24;
const MIN_ARROW_LENGTH = 5;
const ANNOTATION_COLOR = '#f1c21b';
const ANNOTATION_TEXT_COLOR = '#ffffff';
const ARROW_LINE_WIDTH = 4;
const ARROW_HEAD_LENGTH = 18;
const ARROW_HANDLE_RADIUS = 8;
// 矢印・文字をクリックで選べる距離（px）
const ANNOTATION_HIT_DISTANCE = 10;

/** 文字の書き込みが占める矩形（描画・当たり判定で共有） */
function textAnnotationBox(ctx, a) {
    ctx.save();
    ctx.font = `600 ${a.size}px ${CANVAS_FONT}`;
    const w = ctx.measureText(a.text).width;
    ctx.restore();
    return { x0: a.x - w / 2, y0: a.y - a.size / 2 - 2, x1: a.x + w / 2, y1: a.y + a.size / 2 + 2 };
}

/** (x1,y1)→(x2,y2) の矢印を描く。矢じりは終点側（withHead が false なら線だけ） */
function drawArrow(ctx, x1, y1, x2, y2, color, width, withHead = true) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = withHead ? Math.min(ARROW_HEAD_LENGTH, len * 0.7) : 0;
    const bx = x2 - Math.cos(angle) * head * 0.8;
    const by = y2 - Math.sin(angle) * head * 0.8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (!withHead) {
        ctx.restore();
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - 0.45) * head, y2 - Math.sin(angle - 0.45) * head);
    ctx.lineTo(x2 - Math.cos(angle + 0.45) * head, y2 - Math.sin(angle + 0.45) * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** 書き込み（文字・矢印）を描く */
function drawAnnotations(ctx, annotations, selected) {
    annotations.forEach(a => {
        const isSelected = selected && selected.type === 'annotation' && selected.id === a.id;
        if (a.type === 'text') {
            ctx.save();
            ctx.font = `600 ${a.size}px ${CANVAS_FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(4, a.size / 5);
            ctx.strokeStyle = CANVAS_BG_COLOR;
            ctx.strokeText(a.text, a.x, a.y);
            ctx.fillStyle = ANNOTATION_TEXT_COLOR;
            ctx.fillText(a.text, a.x, a.y);
            ctx.restore();
            if (isSelected) {
                const box = textAnnotationBox(ctx, a);
                ctx.save();
                ctx.strokeStyle = TABLE_SELECTED_STROKE_COLOR;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(box.x0 - 4, box.y0 - 2, box.x1 - box.x0 + 8, box.y1 - box.y0 + 4);
                ctx.restore();
            }
        } else if (a.type === 'arrow' || a.type === 'line') {
            drawArrow(ctx, a.x1, a.y1, a.x2, a.y2,
                isSelected ? SEAT_SELECTED_COLOR : ANNOTATION_COLOR, ARROW_LINE_WIDTH, a.type === 'arrow');
            if (isSelected) {
                ctx.save();
                [[a.x1, a.y1], [a.x2, a.y2]].forEach(([x, y]) => {
                    ctx.beginPath();
                    ctx.arc(x, y, ARROW_HANDLE_RADIUS - 2, 0, Math.PI * 2);
                    ctx.fillStyle = CANVAS_BG_COLOR;
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = TABLE_SELECTED_STROKE_COLOR;
                    ctx.stroke();
                });
                ctx.restore();
            }
        }
    });
}

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
    } else if (preview.type === 'arrow' || preview.type === 'line') {
        ctx.globalAlpha = 0.7;
        drawArrow(ctx, preview.x1, preview.y1, preview.x2, preview.y2, ANNOTATION_COLOR, ARROW_LINE_WIDTH,
            preview.type === 'arrow');
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

    // 書き込み（文字・矢印）: 机の上・座席の下
    drawAnnotations(ctx, layout.annotations || [], selected);

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
    });

    drawNameLabels(ctx, layout, names);

    drawDrawEffects(ctx, layout, names, opts);
}

// 名前ラベル（席の近くに表示する着席者名）
const NAME_FONT_SIZE = 14;
const NAME_LABEL_HEIGHT = 18;
const NAME_LABEL_GAP = 3;
// 席から離れるときの探索幅と上限（px）
const NAME_SEARCH_STEP = 12;
const NAME_SEARCH_MAX = 144;
// これ以上離れたラベルには、どの席の名前かを示す補助線を引く（px）
const NAME_LEADER_DISTANCE = 20;
// 席の周りを探す向き（優先順: 下・上・右・左・斜め）
const NAME_DIRECTIONS = [90, 270, 0, 180, 45, 135, 315, 225, 67.5, 112.5, 247.5, 292.5, 22.5, 157.5, 202.5, 337.5]
    .map(deg => deg * Math.PI / 180);

const nameWidthCache = new Map();

function nameLabelWidth(ctx, name) {
    let w = nameWidthCache.get(name);
    if (w === undefined) {
        ctx.save();
        ctx.font = `500 ${NAME_FONT_SIZE}px ${CANVAS_FONT}`;
        w = ctx.measureText(name).width + 6;
        ctx.restore();
        if (nameWidthCache.size > 500) nameWidthCache.clear();
        nameWidthCache.set(name, w);
    }
    return w;
}

function rectsOverlap(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function rectHitsCircle(r, cx, cy, radius) {
    const nx = Math.max(r.x0, Math.min(cx, r.x1));
    const ny = Math.max(r.y0, Math.min(cy, r.y1));
    return Math.hypot(cx - nx, cy - ny) < radius;
}

/**
 * 名前ラベルの位置を決める。ラベル同士・座席・文字の書き込みと重ならないよう、
 * 席の真下から順に少しずつ離しながら空いている場所を探す。
 * @returns {Array<{seat: object, name: string, rect: object, far: boolean}>}
 */
function placeNameLabels(ctx, layout, names) {
    const placed = [];
    const textBoxes = (layout.annotations || [])
        .filter(a => a.type === 'text')
        .map(a => textAnnotationBox(ctx, a));

    layout.seats.forEach(seat => {
        if (!names.has(seat.id)) return;
        const name = names.get(seat.id);
        const w = nameLabelWidth(ctx, name);
        const h = NAME_LABEL_HEIGHT;

        const rectAt = (angle, d) => {
            const r = SEAT_RADIUS + NAME_LABEL_GAP + d;
            const cx = seat.x + Math.cos(angle) * (r + Math.abs(Math.cos(angle)) * w / 2);
            const cy = seat.y + Math.sin(angle) * (r + Math.abs(Math.sin(angle)) * h / 2);
            const rect = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
            // キャンバスの外に出ないよう内側に寄せる
            const dx = rect.x0 < 0 ? -rect.x0 : (rect.x1 > CANVAS_W ? CANVAS_W - rect.x1 : 0);
            const dy = rect.y0 < 0 ? -rect.y0 : (rect.y1 > CANVAS_H ? CANVAS_H - rect.y1 : 0);
            return { x0: rect.x0 + dx, y0: rect.y0 + dy, x1: rect.x1 + dx, y1: rect.y1 + dy };
        };
        const isFree = rect =>
            !placed.some(l => rectsOverlap(rect, l.rect)) &&
            !textBoxes.some(b => rectsOverlap(rect, b)) &&
            !layout.seats.some(o => rectHitsCircle(rect, o.x, o.y, SEAT_RADIUS + 2));

        let found = null;
        for (let d = 0; d <= NAME_SEARCH_MAX && !found; d += NAME_SEARCH_STEP) {
            for (const angle of NAME_DIRECTIONS) {
                const rect = rectAt(angle, d);
                if (isFree(rect)) {
                    found = { rect, d };
                    break;
                }
            }
        }
        // 空きが見つからないときは席の真下に置く（重なりは許容）
        if (!found) found = { rect: rectAt(NAME_DIRECTIONS[0], 0), d: 0 };
        placed.push({ seat, name, rect: found.rect, far: found.d >= NAME_LEADER_DISTANCE });
    });
    return placed;
}

/** 着席者の名前を描く。席から離れた名前には補助線を引く */
function drawNameLabels(ctx, layout, names) {
    if (names.size === 0) return;
    const labels = placeNameLabels(ctx, layout, names);

    ctx.save();
    // 補助線（席の縁からラベルの一番近い点まで）
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(244, 244, 244, 0.6)';
    labels.forEach(({ seat, rect, far }) => {
        if (!far) return;
        const qx = Math.max(rect.x0, Math.min(seat.x, rect.x1));
        const qy = Math.max(rect.y0, Math.min(seat.y, rect.y1));
        const len = Math.hypot(qx - seat.x, qy - seat.y);
        if (len <= SEAT_RADIUS) return;
        const sx = seat.x + (qx - seat.x) / len * SEAT_RADIUS;
        const sy = seat.y + (qy - seat.y) / len * SEAT_RADIUS;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(qx, qy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244, 244, 244, 0.85)';
        ctx.fill();
    });

    // 背景色の縁付きで名前を描画（机の上でも読めるように）
    ctx.font = `500 ${NAME_FONT_SIZE}px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    labels.forEach(({ name, rect }) => {
        const cx = (rect.x0 + rect.x1) / 2;
        const cy = (rect.y0 + rect.y1) / 2;
        ctx.strokeStyle = CANVAS_BG_COLOR;
        ctx.strokeText(name, cx, cy);
        ctx.fillStyle = CANVAS_TEXT_COLOR;
        ctx.fillText(name, cx, cy);
    });
    ctx.restore();
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
 *   text    : クリックした位置に文字を書き込む（選択ツールでダブルクリックすると編集）
 *   arrow   : ドラッグで矢印を描く（Shiftで45度刻み）。選択すると両端をドラッグして変形できる
 *   line    : ドラッグで線（矢じりなし）を描く。操作は矢印と同じ
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   getLayout: () => {tables: Array, seats: Array, annotations?: Array},
 *   getAssignedSeatIds: () => Set<number>,
 *   onChange: () => void,          // レイアウトが確定的に変わった（保存＋再描画）
 *   redraw: () => void,            // 再描画のみ（ドラッグ中・作図中など）
 *   onSelectionChange?: () => void,
 *   onMessage?: (message: string) => void   // 利用者に伝えるエラーメッセージ
 * }} hooks
 */
function createLayoutEditor(canvas, hooks) {
    let tool = 'select';
    let selected = null;   // {type: 'seat' | 'table' | 'annotation', id}
    let drag = null;       // 移動中: {type, id, ...}
    let boxDraw = null;    // 四角・丸の作図中: {shape, start, cur}
    let polyDraw = null;   // 多角形の作図中: {points: [...], cursor}
    let arrowDraw = null;  // 矢印・線の作図中: {kind: 'arrow' | 'line', start, cur, snap}

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

    // ---- 書き込み（文字・矢印） ----

    function annotationsOf(layout) {
        if (!layout.annotations) layout.annotations = [];
        return layout.annotations;
    }

    function distanceToSegment(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    function findAnnotationAt(p) {
        const list = annotationsOf(hooks.getLayout());
        const ctx = canvas.getContext('2d');
        for (let i = list.length - 1; i >= 0; i--) {
            const a = list[i];
            if (a.type === 'text') {
                const box = textAnnotationBox(ctx, a);
                const pad = 4;
                if (p.x >= box.x0 - pad && p.x <= box.x1 + pad && p.y >= box.y0 - pad && p.y <= box.y1 + pad) return a;
            } else if (distanceToSegment(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= ANNOTATION_HIT_DISTANCE) {
                return a;
            }
        }
        return null;
    }

    // 選択中の矢印の端点をつかんだか（1: 始点, 2: 終点）
    function findArrowHandleAt(p) {
        if (!selected || selected.type !== 'annotation') return null;
        const a = annotationsOf(hooks.getLayout()).find(x => x.id === selected.id);
        if (!a || a.type === 'text') return null;
        const reach = ARROW_HANDLE_RADIUS + 4;
        if (Math.hypot(p.x - a.x2, p.y - a.y2) <= reach) return { arrow: a, end: 2 };
        if (Math.hypot(p.x - a.x1, p.y - a.y1) <= reach) return { arrow: a, end: 1 };
        return null;
    }

    // 始点から終点までの角度を45度刻みにそろえる
    function snapTo45(from, to) {
        const len = Math.hypot(to.x - from.x, to.y - from.y);
        const step = Math.PI / 4;
        const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
        return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
    }

    // 文字を入力してもらう。取り消し・空欄・長すぎる場合はnull
    function askText(initial) {
        const input = window.prompt(`書き込む文字を入力してください（${MAX_ANNOTATION_TEXT}文字以内）`, initial || '');
        if (input === null) return null;
        const text = input.trim();
        if (!text) return null;
        if (text.length > MAX_ANNOTATION_TEXT) {
            if (hooks.onMessage) hooks.onMessage(`文字は${MAX_ANNOTATION_TEXT}文字以内にしてください`);
            return null;
        }
        return text;
    }

    function addAnnotation(item) {
        const list = annotationsOf(hooks.getLayout());
        if (list.length >= MAX_ANNOTATIONS) {
            if (hooks.onMessage) hooks.onMessage(`書き込みは${MAX_ANNOTATIONS}個までです`);
            return;
        }
        item.id = nextId(list);
        list.push(item);
        select('annotation', item.id);
        hooks.onChange();
    }

    function placeText(p) {
        const text = askText('');
        if (text === null) return;
        addAnnotation({
            type: 'text',
            x: Math.round(p.x),
            y: Math.round(p.y),
            text,
            size: DEFAULT_TEXT_SIZE
        });
    }

    function finishArrowDraw() {
        const draw = arrowDraw;
        arrowDraw = null;
        const end = draw.snap ? snapTo45(draw.start, draw.cur) : draw.cur;
        // クリックのみ・短すぎるドラッグは矢印にしない
        if (Math.hypot(end.x - draw.start.x, end.y - draw.start.y) < CLICK_THRESHOLD) {
            hooks.redraw();
            return;
        }
        addAnnotation({
            type: draw.kind,
            x1: Math.round(draw.start.x),
            y1: Math.round(draw.start.y),
            x2: Math.round(clamp(end.x, 0, CANVAS_W)),
            y2: Math.round(clamp(end.y, 0, CANVAS_H))
        });
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
        arrowDraw = null;
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

        if (tool === 'arrow' || tool === 'line') {
            arrowDraw = { kind: tool, start: p, cur: p, snap: e.shiftKey };
            canvas.setPointerCapture(e.pointerId);
            hooks.redraw();
            return;
        }

        if (tool === 'text') {
            placeText(p);
            return;
        }

        const seat = findSeatAt(p);
        const handle = seat ? null : findArrowHandleAt(p);
        const note = seat || handle ? null : findAnnotationAt(p);
        const table = seat || handle || note ? null : findTableAt(p);

        if (seat) {
            select('seat', seat.id);
            drag = { type: 'seat', id: seat.id, dx: p.x - seat.x, dy: p.y - seat.y, moved: false };
        } else if (tool === 'seat') {
            placeSeat(p);
        } else if (handle) {
            drag = { type: 'annotation', id: handle.arrow.id, mode: 'end' + handle.end, moved: false };
        } else if (note) {
            select('annotation', note.id);
            drag = {
                type: 'annotation', id: note.id, mode: 'move', start: p, moved: false,
                origin: JSON.parse(JSON.stringify(note))
            };
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
        if (arrowDraw) {
            arrowDraw.cur = p;
            arrowDraw.snap = e.shiftKey;
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
        } else if (drag.type === 'annotation') {
            const a = annotationsOf(layout).find(x => x.id === drag.id);
            if (!a) return;
            if (drag.mode === 'move') {
                let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
                const o = drag.origin;
                if (a.type === 'text') {
                    a.x = clamp(Math.round(o.x + dx), 0, CANVAS_W);
                    a.y = clamp(Math.round(o.y + dy), 0, CANVAS_H);
                } else {
                    // 矢印全体がキャンバス内に収まるよう移動量を制限
                    dx = clamp(dx, -Math.min(o.x1, o.x2), CANVAS_W - Math.max(o.x1, o.x2));
                    dy = clamp(dy, -Math.min(o.y1, o.y2), CANVAS_H - Math.max(o.y1, o.y2));
                    a.x1 = Math.round(o.x1 + dx);
                    a.y1 = Math.round(o.y1 + dy);
                    a.x2 = Math.round(o.x2 + dx);
                    a.y2 = Math.round(o.y2 + dy);
                }
            } else {
                // 端点をドラッグ（Shiftで45度刻み）
                const fixed = drag.mode === 'end1' ? { x: a.x2, y: a.y2 } : { x: a.x1, y: a.y1 };
                const target = e.shiftKey ? snapTo45(fixed, p) : p;
                const nx = Math.round(clamp(target.x, 0, CANVAS_W));
                const ny = Math.round(clamp(target.y, 0, CANVAS_H));
                if (Math.hypot(nx - fixed.x, ny - fixed.y) < MIN_ARROW_LENGTH) return;
                if (drag.mode === 'end1') { a.x1 = nx; a.y1 = ny; } else { a.x2 = nx; a.y2 = ny; }
            }
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
        if (arrowDraw) {
            arrowDraw.cur = toCanvasPoint(e);
            arrowDraw.snap = e.shiftKey;
            finishArrowDraw();
            return;
        }
        if (drag && drag.moved) hooks.onChange();
        drag = null;
    }

    function onPointerCancel() {
        if (boxDraw || arrowDraw) {
            cancelDrawing();
            return;
        }
        if (drag && drag.moved) hooks.onChange();
        drag = null;
    }

    function onDoubleClick(e) {
        // ダブルクリックで多角形を確定（最初のクリックで頂点は打たれている）
        if (tool === 'polygon' && polyDraw && polyDraw.points.length >= 3) {
            finishPolygon();
            hooks.redraw();
            return;
        }
        // 選択ツールで文字をダブルクリック: 文字を編集
        if (tool === 'select') {
            const note = findAnnotationAt(toCanvasPoint(e));
            if (note && note.type === 'text') {
                const text = askText(note.text);
                if (text !== null && text !== note.text) {
                    note.text = text;
                    hooks.onChange();
                }
            }
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
            arrowDraw = null;
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
            if (arrowDraw) {
                const end = arrowDraw.snap ? snapTo45(arrowDraw.start, arrowDraw.cur) : arrowDraw.cur;
                return { type: arrowDraw.kind, x1: arrowDraw.start.x, y1: arrowDraw.start.y, x2: end.x, y2: end.y };
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
            if ((boxDraw || arrowDraw) && event.key === 'Escape') {
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

        /** 選択中の席・机・書き込みを削除する。失敗時は理由メッセージを返す */
        deleteSelected() {
            if (!selected) return null;
            const layout = hooks.getLayout();

            if (selected.type === 'seat') {
                if (hooks.getAssignedSeatIds().has(selected.id)) {
                    return '着席中の席は削除できません。先に受付一覧から取り消してください';
                }
                layout.seats = layout.seats.filter(s => s.id !== selected.id);
            } else if (selected.type === 'annotation') {
                layout.annotations = annotationsOf(layout).filter(a => a.id !== selected.id);
            } else {
                layout.tables = layout.tables.filter(t => t.id !== selected.id);
            }
            select(null);
            hooks.onChange();
            return null;
        },

        /** 選択中の机・文字・矢印の大きさを変更する。変更できない場合はメッセージを返す */
        resizeSelected(factor) {
            if (selected && selected.type === 'annotation') {
                const a = annotationsOf(hooks.getLayout()).find(x => x.id === selected.id);
                if (!a) return null;
                if (a.type === 'text') {
                    let size = clamp(Math.round(a.size * factor), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
                    if (size === a.size) {
                        return factor > 1 ? 'これ以上大きくできません' : 'これ以上小さくできません';
                    }
                    a.size = size;
                } else {
                    // 矢印は中点を中心に長さを変える
                    const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2;
                    const s = {
                        x1: Math.round(mx + (a.x1 - mx) * factor), y1: Math.round(my + (a.y1 - my) * factor),
                        x2: Math.round(mx + (a.x2 - mx) * factor), y2: Math.round(my + (a.y2 - my) * factor)
                    };
                    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < MIN_ARROW_LENGTH) return 'これ以上小さくできません';
                    if ([s.x1, s.x2].some(v => v < 0 || v > CANVAS_W) || [s.y1, s.y2].some(v => v < 0 || v > CANVAS_H)) {
                        return 'これ以上大きくできません（キャンバスの外に出ます）';
                    }
                    Object.assign(a, s);
                }
                hooks.onChange();
                return null;
            }
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
