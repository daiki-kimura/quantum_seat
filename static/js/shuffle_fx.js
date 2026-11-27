/**
 * 全体の配置換えの演出（全画面オーバーレイ上のキャンバスに描く）
 *
 *   1. 重ね合わせ: 着席者が席から離れ、光の玉になって会場の中心に集まる
 *   2. 量子もつれ: 玉が加速しながら渦を巻き、空席に干渉の光が走る → フラッシュ
 *   3. 観測: 玉が1つずつ新しい席へ飛び込み、波紋と光の粒が広がる
 *   4. 完了: 花火と紙吹雪
 *
 * 一括配置では、まだ席のない人が会場の外から現れて同じ流れで席に着く（fromSeatId が null）。
 *
 * 席はサーバー側で乱数プールから決定済みで、これは結果を見せるための視覚効果のみ。
 * seat_layout.js の drawVenue / SEAT_RADIUS / QUANTUM_RGB に依存する。
 */
(function () {
    'use strict';

    const SCALE = 2;                 // キャンバスの内部解像度（会場座標 800x600 の2倍）
    const CX = 400;
    const CY = 300;
    const COLORS = ['#08bdba', '#8a3ffc', '#78a9ff', '#ff7eb6', '#f1c21b', '#42be65'];

    const GATHER_MS = 1800;          // 席から中心へ集まる
    const SWIRL_MS = 2800;           // 渦を巻く
    const GAP_MS = 450;              // フラッシュから最初の着地まで
    const FLIGHT_MS = 850;           // 1人分の飛行時間
    const FINALE_MS = 2600;          // 花火と紙吹雪
    const W_START = 0.0015;          // 公転の角速度（rad/ms）: 開始時
    const W_END = 0.0075;            // 公転の角速度（rad/ms）: 加速後

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const easeOut = x => 1 - Math.pow(1 - x, 3);

    // 決定的な疑似乱数（演出の見た目用。席の決定には使わない）
    function hash(a, b) {
        const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
        return v - Math.floor(v);
    }

    // 公転の累積角度
    function angleAt(t) {
        const t0 = GATHER_MS + SWIRL_MS;
        if (t <= t0) return W_START * t + (W_END - W_START) * t * t / (2 * t0);
        return W_START * t0 + (W_END - W_START) * t0 / 2 + W_END * (t - t0);
    }

    // 席の並べ方の総数 P(seats, guests) の表示用文字列
    function permutationText(seats, guests) {
        let log10 = 0;
        for (let i = 0; i < guests; i++) log10 += Math.log10(seats - i);
        if (log10 < 6) {
            let product = 1;
            for (let i = 0; i < guests; i++) product *= seats - i;
            return `${product.toLocaleString('ja-JP')} 通り`;
        }
        const exp = Math.floor(log10);
        return `約 ${Math.pow(10, log10 - exp).toFixed(1)}×10^${exp} 通り`;
    }

    /**
     * @param {HTMLCanvasElement} canvas  オーバーレイのキャンバス（1600x1200）
     * @param {{tables: Array, seats: Array}} layout
     * @param {Array<{name: string, fromSeatId: number|null, toSeatId: number}>} moves
     *   fromSeatId が null の人は会場の外から飛んでくる
     * @param {{
     *   overlay: HTMLElement, finalSub: string,
     *   setTitle: (text: string) => void, setSub: (text: string) => void,
     *   onProgress: (fraction: number) => void,
     *   fixedNames?: Map<number, string>,     // 動かない着席済みの人（席ID -> 名前）。最初から席に表示する
     *   candidateSeatIds?: Set<number>,       // 候補になる席（省略時は全席）
     *   startSub?: string,                    // 最初の段階の説明文
     *   doneTitle?: string                    // 完了時の見出し
     * }} opts
     * @returns {Promise<void>} 演出が終わる（またはクリックでスキップされる）と解決する
     */
    function playShuffleFx(canvas, layout, moves, opts) {
        return new Promise(resolve => {
            const ctx = canvas.getContext('2d');
            const seatById = new Map(layout.seats.map(s => [s.id, s]));
            const n = moves.length;
            const seed = Math.random() * 1000;
            const candidates = opts.candidateSeatIds
                ? layout.seats.filter(s => opts.candidateSeatIds.has(s.id))
                : layout.seats;
            const fixedNames = opts.fixedNames || new Map();

            // 着地の順番は毎回ばらばら
            const order = moves.map((_, i) => i).sort((a, b) => hash(a, seed) - hash(b, seed));
            const orderOf = new Array(n);
            order.forEach((guest, rank) => { orderOf[guest] = rank; });

            const stagger = Math.min(420, 3200 / n);
            const swirlEnd = GATHER_MS + SWIRL_MS;
            const flashAt = swirlEnd + GAP_MS - 250;
            const guests = moves.map((m, i) => ({
                name: m.name,
                // 席のない人は会場の外の輪から現れる
                from: m.fromSeatId == null
                    ? {
                        x: CX + Math.cos(hash(i, seed + 7) * Math.PI * 2) * 520,
                        y: CY + Math.sin(hash(i, seed + 7) * Math.PI * 2) * 420
                    }
                    : seatById.get(m.fromSeatId),
                to: seatById.get(m.toSeatId),
                color: COLORS[i % COLORS.length],
                angle0: hash(i, seed + 1) * Math.PI * 2,
                dir: i % 2 ? 1 : -1,
                radius: 90 + 140 * hash(i, seed + 2),
                delay: (i / n) * GATHER_MS * 0.2,
                launch: swirlEnd + GAP_MS + orderOf[i] * stagger
            }));
            const landEnd = swirlEnd + GAP_MS + (n - 1) * stagger + FLIGHT_MS;
            const total = landEnd + FINALE_MS;
            const permText = permutationText(candidates.length, n);

            function orbitPos(g, i, t) {
                const a = g.angle0 + g.dir * angleAt(t);
                const r = g.radius * (1 + 0.06 * Math.sin(t / 300 + i));
                return { x: CX + r * Math.cos(a), y: CY + r * 0.72 * Math.sin(a) };
            }

            // 時刻 t の玉の位置（着地済み・まだ席にいる場合は null）
            function posAt(g, i, t) {
                if (t >= g.launch + FLIGHT_MS) return null;
                if (t >= g.launch) {
                    const p = ease((t - g.launch) / FLIGHT_MS);
                    const s = orbitPos(g, i, g.launch);
                    const e = g.to;
                    const cx = (s.x + e.x) / 2 + (s.y - e.y) * 0.25;
                    const cy = (s.y + e.y) / 2 - 110;
                    const q = 1 - p;
                    return {
                        x: q * q * s.x + 2 * q * p * cx + p * p * e.x,
                        y: q * q * s.y + 2 * q * p * cy + p * p * e.y
                    };
                }
                const k = ease(clamp((t - g.delay) / (GATHER_MS * 0.8), 0, 1));
                const o = orbitPos(g, i, t);
                return { x: g.from.x + (o.x - g.from.x) * k, y: g.from.y + (o.y - g.from.y) * k };
            }

            function glow(x, y, r, color, alpha) {
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            function drawRain(t) {
                ctx.save();
                ctx.font = '12px "IBM Plex Mono", Menlo, monospace';
                ctx.textAlign = 'center';
                const bucket = Math.floor(t / 110);
                for (let c = 0; c < 20; c++) {
                    const speed = 0.05 + 0.08 * hash(c, 5);
                    const head = (t * speed + hash(c, 6) * 700) % 700 - 40;
                    for (let r = 0; r < 7; r++) {
                        const y = head - r * 15;
                        if (y < 0 || y > 600) continue;
                        const bit = hash(c * 7 + r * 3, bucket) > 0.5 ? '1' : '0';
                        ctx.fillStyle = `rgba(${QUANTUM_RGB}, ${(1 - r / 7) * 0.28})`;
                        ctx.fillText(bit, 20 + c * 40, y);
                    }
                }
                ctx.restore();
            }

            function drawOrbs(t) {
                ctx.globalCompositeOperation = 'lighter';
                guests.forEach((g, i) => {
                    const pos = posAt(g, i, t);
                    if (!pos) return;
                    // 尾
                    for (let k = 9; k >= 1; k--) {
                        const tp = t - k * 28;
                        if (tp < 0) continue;
                        const p = posAt(g, i, tp);
                        if (!p) continue;
                        glow(p.x, p.y, 13 - k, g.color, 0.5 * (1 - k / 10));
                    }
                    glow(pos.x, pos.y, 34, g.color, 0.85);
                    glow(pos.x, pos.y, 12, '#ffffff', 1);
                });
                ctx.globalCompositeOperation = 'source-over';

                // 名前（光の玉に添える）
                ctx.font = '600 15px "IBM Plex Sans", "Hiragino Sans", "Noto Sans JP", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                guests.forEach((g, i) => {
                    const pos = posAt(g, i, t);
                    if (!pos) return;
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = 'rgba(10, 10, 14, 0.9)';
                    ctx.strokeText(g.name, pos.x, pos.y - 24);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(g.name, pos.x, pos.y - 24);
                });
            }

            function drawEntanglement(t) {
                if (t < GATHER_MS * 0.6 || t > swirlEnd + GAP_MS) return;
                const fade = clamp((t - GATHER_MS * 0.6) / 600, 0, 1) *
                    clamp((swirlEnd + GAP_MS - t) / 300, 0, 1);
                const bucket = Math.floor(t / 90);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.lineWidth = 1.5;
                guests.forEach((g, i) => {
                    const a = posAt(g, i, t);
                    const b = posAt(guests[(i + 1) % n], (i + 1) % n, t);
                    if (a && b) {
                        ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${fade * (0.25 + 0.2 * Math.sin(t / 130 + i))})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                    // 候補の席へ走る干渉の線
                    const seat = candidates[Math.floor(hash(i + bucket * 13, seed) * candidates.length)];
                    if (a && seat) {
                        ctx.strokeStyle = `rgba(138, 63, 252, ${fade * 0.35})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(seat.x, seat.y);
                        ctx.stroke();
                    }
                });
                // 候補の席が次々に光る
                ctx.lineWidth = 3;
                ctx.shadowColor = QUANTUM_COLOR;
                ctx.shadowBlur = 16;
                for (let k = 0; k < 6; k++) {
                    const seat = candidates[Math.floor(hash(bucket, k + seed) * candidates.length)];
                    if (!seat) continue;
                    ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${fade * 0.9})`;
                    ctx.beginPath();
                    ctx.arc(seat.x, seat.y, SEAT_RADIUS + 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            function drawCore(t) {
                const remaining = guests.filter(g => t < g.launch + FLIGHT_MS).length;
                const ramp = clamp((t - GATHER_MS * 0.3) / (GATHER_MS + SWIRL_MS * 0.6), 0, 1);
                const size = (70 + 90 * ramp + 12 * Math.sin(t / 120)) * (remaining / n);
                if (size <= 1) return;
                ctx.globalCompositeOperation = 'lighter';
                glow(CX, CY, size * 1.6, '#8a3ffc', 0.55 * ramp);
                glow(CX, CY, size, '#08bdba', 0.6 * ramp);
                ctx.globalCompositeOperation = 'source-over';
            }

            function drawFlash(t) {
                if (t < flashAt || t > flashAt + 600) return;
                const p = (t - flashAt) / 600;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                glow(CX, CY, 520 * (0.3 + p), '#9ef0f0', (1 - p) * 0.9);
                ctx.lineWidth = 8 * (1 - p) + 1;
                ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${1 - p})`;
                ctx.beginPath();
                ctx.arc(CX, CY, p * 520, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // 着地した席の波紋と光の粒
            function drawLandings(t) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                guests.forEach((g, i) => {
                    const dt = t - (g.launch + FLIGHT_MS);
                    if (dt < 0 || dt > 1100) return;
                    const p = dt / 1100;
                    ctx.lineWidth = 3;
                    for (let k = 0; k < 2; k++) {
                        const q = p - k * 0.2;
                        if (q <= 0 || q >= 1) continue;
                        ctx.strokeStyle = `rgba(${QUANTUM_RGB}, ${(1 - q) * 0.9})`;
                        ctx.beginPath();
                        ctx.arc(g.to.x, g.to.y, SEAT_RADIUS + 6 + q * 80, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.strokeStyle = `rgba(241, 194, 27, ${(1 - p) * 0.9})`;
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(g.to.x, g.to.y, SEAT_RADIUS + 3, 0, Math.PI * 2);
                    ctx.stroke();
                    for (let k = 0; k < 18; k++) {
                        const ang = hash(i * 31 + k, seed) * Math.PI * 2;
                        const sp = 40 + 90 * hash(k, i + seed);
                        const r = sp * easeOut(p);
                        ctx.fillStyle = COLORS[k % COLORS.length];
                        ctx.globalAlpha = 1 - p;
                        ctx.beginPath();
                        ctx.arc(g.to.x + Math.cos(ang) * r, g.to.y + Math.sin(ang) * r, 3.2 * (1 - p) + 0.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                });
                ctx.restore();
            }

            function drawFinale(t) {
                const dt = t - landEnd;
                if (dt < 0) return;
                ctx.save();
                // 花火
                ctx.globalCompositeOperation = 'lighter';
                for (let b = 0; b < 8; b++) {
                    const bt = dt - b * 300;
                    if (bt < 0 || bt > 1500) continue;
                    const bx = 100 + hash(b, seed + 3) * 600;
                    const by = 90 + hash(b, seed + 4) * 280;
                    const fade = 1 - bt / 1500;
                    for (let k = 0; k < 40; k++) {
                        const ang = (k / 40) * Math.PI * 2 + hash(b, k) * 0.3;
                        const speed = 90 + 70 * hash(k, b + seed);
                        const r = speed * (1 - Math.exp(-bt / 350));
                        ctx.fillStyle = COLORS[(b + k) % COLORS.length];
                        ctx.globalAlpha = fade;
                        ctx.beginPath();
                        ctx.arc(bx + Math.cos(ang) * r, by + Math.sin(ang) * r + 0.00005 * bt * bt, 2.6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
                // 紙吹雪
                for (let j = 0; j < 90; j++) {
                    const y = -30 + dt * (0.18 + 0.25 * hash(j, 4));
                    if (y > 640) continue;
                    const x = hash(j, 3) * 800 + 30 * Math.sin(dt / 300 + j);
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(dt / 200 + j);
                    ctx.fillStyle = COLORS[j % COLORS.length];
                    ctx.fillRect(-5, -2.5, 10, 5);
                    ctx.restore();
                }
            }

            let phase = -1;
            let lastDone = -1;
            function updateText(t) {
                let next = 3;
                if (t < GATHER_MS) next = 0;
                else if (t < swirlEnd + GAP_MS) next = 1;
                else if (t < landEnd) next = 2;
                if (next !== phase) {
                    phase = next;
                    opts.setTitle([
                        '全員を量子の重ね合わせ状態へ',
                        '量子もつれ ─ 配置をシャッフル中',
                        '観測！ 配置が確定していきます',
                        opts.doneTitle || '配置換え完了！'
                    ][phase]);
                    if (phase === 0) {
                        opts.setSub(opts.startSub ||
                            `${n}名の席をいったん白紙に戻し、空席を含む全${layout.seats.length}席を候補にします`);
                    }
                    if (phase === 1) opts.setSub(`|Ψ⟩ = Σ|配置⟩　… ${permText}が同時に存在`);
                    if (phase === 3) opts.setSub(opts.finalSub);
                }
                if (phase === 2) {
                    const done = guests.filter(g => t >= g.launch + FLIGHT_MS).length;
                    if (done !== lastDone) {
                        lastDone = done;
                        opts.setSub(`${done} / ${n} 名 確定`);
                    }
                }
            }

            let rafId = 0;
            let finished = false;
            const startedAt = performance.now();

            function finish() {
                if (finished) return;
                finished = true;
                cancelAnimationFrame(rafId);
                opts.overlay.removeEventListener('click', finish);
                opts.onProgress(1);
                resolve();
            }

            function frame(now) {
                if (finished) return;
                const t = now - startedAt;
                if (t >= total) {
                    finish();
                    return;
                }
                updateText(t);
                opts.onProgress(clamp(t / landEnd, 0, 1));

                // 着地済みの人だけ席に名前が表示される（それまでは候補の席が空席＝重ね合わせ）
                const names = new Map(fixedNames);
                guests.forEach(g => {
                    if (t >= g.launch + FLIGHT_MS) names.set(g.to.id, g.name);
                });

                ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
                drawVenue(canvas, layout, {
                    names,
                    superposition: t < landEnd ? t / 200 : undefined
                });
                drawRain(t);
                drawCore(t);
                drawEntanglement(t);
                drawLandings(t);
                drawOrbs(t);
                drawFlash(t);
                drawFinale(t);
                rafId = requestAnimationFrame(frame);
            }

            opts.overlay.addEventListener('click', finish);
            rafId = requestAnimationFrame(frame);
        });
    }

    window.playShuffleFx = playShuffleFx;
})();
