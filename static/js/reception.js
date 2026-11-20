/**
 * 受付画面のロジック - 受付（席決め）・配置換え・リセット・レイアウト保存
 */
(function () {
    'use strict';

    // サーバーが保持する状態のクライアント側コピー
    const state = { tables: [], seats: [], assignments: [], participants: [] };

    let lastSeatId = null;   // 直近に決まった席（強調表示用）
    let busy = false;        // 量子乱数の取得中
    let poolStatus = null;   // 乱数プールの状態（サーバーから取得した最新値）
    let saveChain = Promise.resolve();
    let editor = null;

    const $ = id => document.getElementById(id);

    // 乱数プールからの読み出しなので待ち時間はほぼないが、念のための上限（ミリ秒）
    const DRAW_TIMEOUT_MS = 60 * 1000;
    // 乱数プールの残りがこのビット数を下回ったら警告する
    const POOL_LOW_BITS = 1000;
    const DEFAULT_TIMEOUT_MS = 30 * 1000;

    // レイアウト編集ツールごとの操作ガイド
    const TOOL_HINTS = {
        select: 'テーブルや席をクリックで選択、ドラッグで移動します',
        rect: 'ドラッグして四角形のテーブルを描きます（Shiftで正方形）',
        ellipse: 'ドラッグして丸いテーブルを描きます（Shiftで正円）',
        polygon: '頂点を順にクリック。始点（赤い点）をクリックかEnterで確定します',
        seat: '席を置きたい場所をクリックします'
    };

    // ---- API ----

    async function api(method, url, body, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal
            });
            let data = null;
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }
            if (!data || !data.success) {
                throw new Error((data && data.error) || '通信に失敗しました');
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('サーバーからの応答がありませんでした');
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    function applyState(newState) {
        state.tables = newState.tables;
        state.seats = newState.seats;
        state.assignments = newState.assignments;
        state.participants = newState.participants || [];
    }

    // ---- 表示ヘルパー ----

    function showNotice(text, type) {
        const notice = $('notice');
        notice.textContent = text;
        notice.className = 'notice notice-' + (type || 'info');
        notice.style.display = 'block';
    }

    function clearNotice() {
        $('notice').style.display = 'none';
    }

    function setLayoutStatus(text, isError) {
        const el = $('layout-status');
        el.textContent = text;
        el.className = isError ? 'error-text' : 'muted';
    }

    function setBusy(value, text) {
        busy = value;
        ['checkin-btn', 'guest-name', 'reshuffle-btn', 'reset-btn'].forEach(id => {
            $(id).disabled = value;
        });
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.disabled = value;
        });
        $('loading').style.display = value ? 'block' : 'none';
        if (text) $('loading-text').textContent = text;
    }

    function methodLabel(method, backend) {
        if (method === 'quantum') return `量子乱数（${backend}）`;
        return '疑似乱数';
    }

    // 量子乱数で決まらなかった場合の警告文（量子乱数で決まったときは空文字）
    function fallbackWarning(method) {
        return method === 'quantum' ? '' : '乱数プールが空のため、疑似乱数で決定しました';
    }

    function formatTime(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }

    function seatNames() {
        const names = new Map();
        state.assignments.forEach(a => names.set(a.seat_id, a.name));
        return names;
    }

    function seatLabel(seatId) {
        const seat = state.seats.find(s => s.id === seatId);
        return seat ? seat.label : '?';
    }

    // ---- 乱数プールの残りビット（カウンター）と消費ビットの目安 ----

    // 画面に表示する残りビット数を更新する（ヘッダーのカードと配置換え演出の両方）
    function setRemaining(n) {
        const text = Math.max(0, Math.round(n)).toLocaleString('ja-JP');
        $('pool-remaining').textContent = text;
        $('shuffle-bits').textContent = text;
    }

    // 0〜m-1 から1つ選ぶときに読むビット数の期待値（必要ビット数 k を、棄却分を含めて数える）
    function expectedBits(m) {
        if (m <= 1) return 0;
        const k = (m - 1).toString(2).length;
        return k * Math.pow(2, k) / m;
    }

    function updateBitLabels() {
        const seats = state.seats.length;
        const guests = state.assignments.length;
        const checkinBits = Math.round(expectedBits(seats - guests));
        $('checkin-bits').textContent = seats - guests <= 1 ? '（0ビット消費）' : `（約${checkinBits}ビット消費）`;

        let total = 0;
        for (let i = 0; i < guests; i++) total += expectedBits(seats - i);
        $('reshuffle-bits').textContent = `（約${Math.round(total)}ビット消費）`;
    }

    // ---- 描画 ----

    function render() {
        const names = seatNames();

        drawVenue($('venue-canvas'), state, { names, highlightSeatId: lastSeatId });
        drawVenue($('seat-canvas'), state, {
            names,
            selected: editor ? editor.getSelected() : null,
            preview: editor ? editor.getPreview() : null
        });

        const drawingPolygon = editor ? editor.isDrawingPolygon() : false;
        $('poly-finish-btn').disabled = !drawingPolygon;
        $('poly-cancel-btn').disabled = !drawingPolygon;

        $('seat-count').textContent = state.seats.length;

        const taken = state.assignments.length;
        const total = state.seats.length;
        $('stats').textContent = `着席 ${taken} / 全 ${total} 席（空き ${Math.max(total - taken, 0)}）`;

        renderGuestList();
        renderNameSuggestions(names);
        updateBitLabels();
    }

    function renderGuestList() {
        const tbody = $('guest-tbody');
        tbody.textContent = '';

        // 新しく受付した順に上から表示
        state.assignments.slice().reverse().forEach(a => {
            const row = tbody.insertRow();
            row.insertCell().textContent = seatLabel(a.seat_id);
            row.insertCell().textContent = a.name;
            row.insertCell().textContent = formatTime(a.seated_at);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary btn-small cancel-btn';
            button.textContent = '取消';
            button.disabled = busy;
            button.addEventListener('click', () => cancelSeat(a));
            row.insertCell().appendChild(button);
        });

        $('guest-empty').style.display = state.assignments.length ? 'none' : 'block';
        $('guest-table').style.display = state.assignments.length ? 'table' : 'none';
    }

    // 名前の入力候補（参加者リスト）から着席済みの人を除いて表示する
    function renderNameSuggestions(names) {
        const seated = new Set(names.values());
        const candidates = state.participants.filter(n => !seated.has(n));

        const list = $('participant-list');
        list.textContent = '';
        candidates.forEach(n => {
            const option = document.createElement('option');
            option.value = n;
            list.appendChild(option);
        });

        // タップで選べる候補ボタン（選んだあとも入力欄で書き換えられる）
        const chips = $('name-chips');
        chips.textContent = '';
        candidates.forEach(n => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.textContent = n;
            chip.addEventListener('click', () => {
                const input = $('guest-name');
                input.value = n;
                input.focus();
            });
            chips.appendChild(chip);
        });

        $('participants-count').textContent = state.participants.length
            ? `（${state.participants.length}名）` : '（未設定）';
    }

    // 参加者リスト（名前の候補）を上書き保存する
    async function saveParticipants(names) {
        clearNotice();
        try {
            const data = await api('PUT', '/api/participants', { names });
            applyState(data.state);
            $('participants-text').value = state.participants.join('\n');
            showNotice(`参加者リストを保存しました（${state.participants.length}名）`, 'ok');
        } catch (error) {
            showNotice(error.message, 'error');
        }
        render();
    }

    function showResult(name, seat, method, backend, bitsUsed) {
        $('result-name').textContent = name;
        $('result-seat').textContent = `${seat.label}番`;
        const bits = method === 'quantum' && bitsUsed > 0 ? `（${bitsUsed}ビット消費）` : '';
        $('result-meta').textContent = `${methodLabel(method, backend)} で決定${bits}`;
        $('result-card').style.display = 'block';
        const warning = fallbackWarning(method);
        if (warning) showNotice(warning, 'error');
    }

    // ---- 席決めの演出（ビンゴ風・量子テーマ） ----
    // 席はサーバー側で乱数プールから決定済み。ここは結果を見せるための視覚効果のみ。

    const ROLL_MS = 2600;        // 候補が次々に切り替わる時間
    const COLLAPSE_MS = 1000;    // 状態が収縮して席が確定する時間
    const MAX_AMP_BARS = 24;

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * 抽選演出を再生する。まだ受付前の状態（state）の会場図の上で、
     * 空席が重ね合わさった状態から1席に収縮するまでを見せる。
     * クリックでスキップ（収縮の場面へ）できる。
     */
    function playDrawAnimation(chosenSeatId, freeSeats, counter) {
        if (freeSeats.length < 2 || prefersReducedMotion()) return Promise.resolve();
        if (!freeSeats.some(s => s.id === chosenSeatId)) return Promise.resolve();

        return new Promise(resolve => {
            const stage = $('draw-stage');
            const caption = $('draw-caption');
            const ball = $('draw-ball');
            const ballText = $('draw-ball-text');
            const bars = $('amp-bars');
            const canvas = $('venue-canvas');
            const names = seatNames();
            const chosen = freeSeats.find(s => s.id === chosenSeatId);
            const total = freeSeats.length;

            // 振幅バー（最大24本。決定した席は必ず含める）
            const others = freeSeats.filter(s => s.id !== chosenSeatId).slice(0, MAX_AMP_BARS - 1);
            const barSeats = [chosen].concat(others)
                .sort((a, b) => a.label - b.label);
            bars.textContent = '';
            const barEls = barSeats.map(seat => {
                const bar = document.createElement('div');
                bar.className = 'amp-bar';
                bar.title = `席 ${seat.label}`;
                bars.appendChild(bar);
                return { seat, bar };
            });

            let phase = 'roll';
            let rafId = 0;
            let tickTimer = 0;
            let finished = false;
            let scanId = freeSeats[0].id;
            let lastLabelId = null;
            let rollStart = performance.now();
            let collapseStart = 0;

            caption.textContent = `|ψ⟩ = Σ|席⟩ / √${total}（空席${total}通りが同時に存在）`;
            ball.className = 'draw-ball';
            ballText.textContent = '?';
            bars.className = 'amp-bars';
            stage.style.display = 'block';

            function randomizeBars() {
                barEls.forEach(({ bar }) => {
                    bar.classList.remove('chosen');
                    bar.style.height = `${15 + Math.random() * 85}%`;
                });
            }

            function pickScan() {
                let seat;
                do {
                    seat = freeSeats[Math.floor(Math.random() * total)];
                } while (seat.id === lastLabelId && total > 1);
                lastLabelId = seat.id;
                scanId = seat.id;
                ballText.textContent = seat.label;
                randomizeBars();
            }

            function tick() {
                if (phase !== 'roll') return;
                const t = Math.min((performance.now() - rollStart) / ROLL_MS, 1);
                if (t >= 1) {
                    collapse();
                    return;
                }
                pickScan();
                tickTimer = setTimeout(tick, 55 + 360 * t * t);
            }

            function frame(now) {
                if (finished) return;
                if (counter) {
                    const f = Math.min((now - rollStart) / (ROLL_MS + 400), 1);
                    setRemaining(counter.from + (counter.to - counter.from) * f);
                }
                const options = { names, superposition: now / 200 };
                if (phase === 'roll') {
                    options.scanSeatId = scanId;
                } else {
                    options.scanSeatId = chosenSeatId;
                    options.ripple = {
                        seatId: chosenSeatId,
                        t: Math.min((now - collapseStart) / COLLAPSE_MS, 1)
                    };
                    delete options.superposition;
                    if (now - collapseStart >= COLLAPSE_MS) {
                        finish();
                        return;
                    }
                }
                drawVenue(canvas, state, options);
                rafId = requestAnimationFrame(frame);
            }

            function collapse() {
                if (phase !== 'roll') return;
                phase = 'collapse';
                clearTimeout(tickTimer);
                collapseStart = performance.now();
                ballText.textContent = chosen.label;
                ball.classList.add('collapsed');
                bars.classList.add('collapsed');
                barEls.forEach(({ seat, bar }) => {
                    if (seat.id === chosenSeatId) {
                        bar.style.height = '100%';
                        bar.classList.add('chosen');
                    } else {
                        bar.style.height = '4%';
                    }
                });
                caption.textContent = `観測！ 状態が |${chosen.label}⟩ に収縮`;
            }

            function finish() {
                if (finished) return;
                finished = true;
                clearTimeout(tickTimer);
                cancelAnimationFrame(rafId);
                stage.removeEventListener('click', collapse);
                stage.style.display = 'none';
                if (counter) setRemaining(counter.to);
                resolve();
            }

            stage.addEventListener('click', collapse);
            pickScan();
            tickTimer = setTimeout(tick, 55);
            rafId = requestAnimationFrame(frame);
        });
    }

    // ---- 受付操作 ----

    async function checkIn(event) {
        event.preventDefault();
        if (busy) return;

        const input = $('guest-name');
        const name = input.value.trim();
        if (!name) return;

        clearNotice();
        $('result-card').style.display = 'none';
        setBusy(true, '席を決めています...');

        try {
            const freeSeats = state.seats.filter(s => !state.assignments.some(a => a.seat_id === s.id));
            const data = await api('POST', '/api/checkin', { name }, DRAW_TIMEOUT_MS);
            $('loading').style.display = 'none';
            const counter = poolStatus && data.pool
                ? { from: poolStatus.remaining_bits, to: data.pool.remaining_bits } : null;
            await playDrawAnimation(data.seat.id, freeSeats, counter);
            if (data.pool) {
                poolStatus = data.pool;
                setRemaining(data.pool.remaining_bits);
            }
            applyState(data.state);
            lastSeatId = data.seat.id;
            showResult(data.assignment.name, data.seat, data.method, data.backend, data.bits_used);
            input.value = '';
        } catch (error) {
            showNotice(error.message, 'error');
        } finally {
            setBusy(false);
            render();
            fetchBackendInfo();
            input.focus();
        }
    }

    async function cancelSeat(assignment) {
        if (busy) return;
        const label = seatLabel(assignment.seat_id);
        if (!confirm(`${assignment.name} さん（席 ${label}）の着席を取り消しますか？`)) return;

        clearNotice();
        try {
            const data = await api('POST', '/api/checkout', { seat_id: assignment.seat_id });
            applyState(data.state);
            if (lastSeatId === assignment.seat_id) {
                lastSeatId = null;
                $('result-card').style.display = 'none';
            }
            showNotice(`${assignment.name} さんの着席を取り消しました`, 'ok');
        } catch (error) {
            showNotice(error.message, 'error');
        }
        render();
    }

    /**
     * 全体の配置換えの演出を再生する（全画面オーバーレイ）。state はまだ配置換え前の状態であること。
     * 席はサーバー側で決定済みで、これは結果を見せるための視覚効果のみ。
     */
    async function playReshuffleAnimation(before, after, data, from) {
        if (prefersReducedMotion() || typeof window.playShuffleFx !== 'function') return;

        const newSeatByName = new Map(after.map(a => [a.name, a.seat_id]));
        const moves = before
            .filter(b => newSeatByName.has(b.name))
            .map(b => ({ name: b.name, fromSeatId: b.seat_id, toSeatId: newSeatByName.get(b.name) }));
        if (moves.length === 0) return;

        const overlay = $('shuffle-overlay');
        const to = data.pool ? data.pool.remaining_bits : null;
        const counting = from !== null && to !== null;
        if (counting) setRemaining(from);
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        try {
            await window.playShuffleFx($('shuffle-canvas'), state, moves, {
                overlay,
                finalSub: data.method === 'quantum' && data.bits_used > 0
                    ? `量子乱数 ${data.bits_used} ビットを消費しました` : '',
                setTitle: text => { $('shuffle-title').textContent = text; },
                setSub: text => { $('shuffle-sub').textContent = text; },
                onProgress: f => { if (counting) setRemaining(from + (to - from) * f); }
            });
        } finally {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async function reshuffle() {
        if (busy) return;
        if (state.assignments.length === 0) {
            showNotice('着席している方がいません', 'error');
            return;
        }
        if (!confirm(`着席済みの ${state.assignments.length} 名全員の席を、空席を含む全 ${state.seats.length} 席の中から量子乱数で決め直します。よろしいですか？`)) return;

        clearNotice();
        $('result-card').style.display = 'none';
        setBusy(true, '全体の配置換え中...');

        try {
            const before = state.assignments.map(a => ({ name: a.name, seat_id: a.seat_id }));
            const from = poolStatus ? poolStatus.remaining_bits : null;
            const data = await api('POST', '/api/reshuffle', {}, DRAW_TIMEOUT_MS);
            $('loading').style.display = 'none';
            await playReshuffleAnimation(before, data.state.assignments, data, from);
            if (data.pool) {
                poolStatus = data.pool;
                setRemaining(data.pool.remaining_bits);
            }
            applyState(data.state);
            lastSeatId = null;
            const warning = fallbackWarning(data.method);
            const bits = data.method === 'quantum' && data.bits_used > 0 ? `・${data.bits_used}ビット消費` : '';
            showNotice(warning
                ? `配置換えが完了しました。${warning}`
                : `配置換えが完了しました（${methodLabel(data.method, data.backend)}${bits}）`,
            warning ? 'error' : 'ok');
        } catch (error) {
            showNotice(error.message, 'error');
        } finally {
            setBusy(false);
            render();
            fetchBackendInfo();
        }
    }

    async function resetAll() {
        if (busy) return;
        if (!confirm('着席状況をすべてリセットします（会場レイアウトは残ります）。よろしいですか？')) return;

        clearNotice();
        try {
            const data = await api('POST', '/api/reset', {});
            applyState(data.state);
            lastSeatId = null;
            $('result-card').style.display = 'none';
            showNotice('着席状況をリセットしました', 'ok');
        } catch (error) {
            showNotice(error.message, 'error');
        }
        render();
    }

    // CSVの1フィールドを安全に整形（数式として解釈されないようにし、引用符で囲む）
    function csvField(value) {
        let text = String(value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function exportCsv() {
        if (state.assignments.length === 0) {
            showNotice('出力する着席データがありません', 'error');
            return;
        }
        const rows = [['席番号', '名前', '受付時刻']];
        state.assignments
            .slice()
            .sort((a, b) => seatLabel(a.seat_id) - seatLabel(b.seat_id))
            .forEach(a => rows.push([seatLabel(a.seat_id), a.name, a.seated_at]));

        const csv = '\uFEFF' + rows.map(r => r.map(csvField).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `seat_assignment_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ---- レイアウト編集 ----

    function saveLayout() {
        setLayoutStatus('保存中...', false);
        // 保存リクエストを直列化して順序を保証する
        saveChain = saveChain.then(async () => {
            try {
                await api('PUT', '/api/layout', { tables: state.tables, seats: state.seats });
                setLayoutStatus('保存済み', false);
            } catch (error) {
                setLayoutStatus(`保存に失敗しました: ${error.message}`, true);
                // サーバー側の状態に合わせ直す
                try {
                    const data = await api('GET', '/api/state');
                    applyState(data.state);
                    if (editor) editor.clearSelection();
                    render();
                } catch (e) {
                    // 再取得にも失敗した場合は表示中のまま
                }
            }
        });
    }

    function setupEditor() {
        editor = createLayoutEditor($('seat-canvas'), {
            getLayout: () => state,
            getAssignedSeatIds: () => new Set(state.assignments.map(a => a.seat_id)),
            onChange: () => {
                render();
                saveLayout();
            },
            redraw: render,
            onSelectionChange: () => {
                setLayoutStatus('', false);
            }
        });

        document.querySelectorAll('[data-tool]').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                editor.setTool(button.dataset.tool);
                $('draw-hint').textContent = TOOL_HINTS[button.dataset.tool] || '';
                setLayoutStatus('', false);
            });
        });

        $('grow-btn').addEventListener('click', () => reportLayoutError(editor.resizeSelected(1.15)));
        $('shrink-btn').addEventListener('click', () => reportLayoutError(editor.resizeSelected(1 / 1.15)));
        $('delete-btn').addEventListener('click', deleteSelected);
        $('clear-layout-btn').addEventListener('click', clearLayout);
        $('poly-finish-btn').addEventListener('click', () => reportLayoutError(editor.finishPolygon()));
        $('poly-cancel-btn').addEventListener('click', () => editor.cancelDrawing());

        document.addEventListener('keydown', event => {
            if ($('panel-layout').style.display === 'none') return;
            const tag = event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            // 作図中のキー操作（Enter確定・Esc取消・Backspaceで頂点を戻す）を優先
            if (editor.handleKey(event)) {
                event.preventDefault();
                return;
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                deleteSelected();
            }
        });

        $('draw-hint').textContent = TOOL_HINTS.select;
    }

    function reportLayoutError(message) {
        if (message) setLayoutStatus(message, true);
    }

    function deleteSelected() {
        reportLayoutError(editor.deleteSelected());
    }

    function clearLayout() {
        if (state.tables.length === 0 && state.seats.length === 0) return;
        if (state.assignments.length > 0) {
            setLayoutStatus('着席中の方がいるため全消去できません。先に全体リセットしてください', true);
            return;
        }
        if (!confirm('すべての机と席を削除しますか？')) return;

        state.tables = [];
        state.seats = [];
        editor.clearSelection();
        render();
        saveLayout();
    }

    // ---- 画面切り替え・初期化 ----

    function setupTabs() {
        const activate = target => {
            document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === target));
            $('panel-reception').style.display = target === 'reception' ? 'block' : 'none';
            $('panel-layout').style.display = target === 'layout' ? 'block' : 'none';
            render();
        };
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => activate(tab.dataset.tab));
        });
        // 仕組みページからのリンク（/#layout）で会場レイアウトを開く
        if (location.hash === '#layout') activate('layout');
    }

    // 生成日時を「2026/11/18 12:46」の形式にする
    function formatGeneratedAt(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 乱数プール（事前に実機で取得した量子乱数）の状態をヘッダーに表示する
    function renderPool(pool) {
        poolStatus = pool;
        const card = $('pool-card');
        const title = $('backend-status');
        const detail = $('pool-detail');
        const row = $('pool-remaining-row');
        card.classList.remove('pool-low', 'pool-empty');

        setRemaining(pool.remaining_bits);
        $('pool-total').textContent = `/ ${pool.total_bits.toLocaleString('ja-JP')} ビット`;
        row.style.display = pool.total_bits === 0 ? 'none' : 'flex';

        if (pool.total_bits === 0) {
            card.classList.add('pool-empty');
            title.textContent = '量子乱数プールが空です';
            detail.textContent = 'fetch_quantum_pool.py で実機から取得してください（それまでは疑似乱数）';
            return;
        }

        const generated = pool.fetched_at ? formatGeneratedAt(pool.fetched_at) : '';
        detail.textContent = generated ? `${pool.backend} ／ ${generated}に生成` : pool.backend;

        if (pool.remaining_bits === 0) {
            card.classList.add('pool-empty');
            title.textContent = '量子乱数を使い切りました（疑似乱数で動作中）';
        } else if (pool.remaining_bits < POOL_LOW_BITS) {
            card.classList.add('pool-low');
            title.textContent = '量子乱数の残りがわずかです';
        } else {
            title.textContent = `実機の量子乱数: ${pool.backend}`;
        }
    }

    async function fetchBackendInfo() {
        try {
            const data = await api('GET', '/api/backend-info');
            renderPool(data.pool);
            updateBitLabels();
        } catch (error) {
            $('backend-status').textContent = '乱数プールの状態を取得できませんでした';
            $('pool-detail').textContent = '';
        }
    }

    async function init() {
        setupTabs();
        setupEditor();

        $('checkin-form').addEventListener('submit', checkIn);
        $('reshuffle-btn').addEventListener('click', reshuffle);
        $('reset-btn').addEventListener('click', resetAll);
        $('export-btn').addEventListener('click', exportCsv);
        $('participants-save').addEventListener('click', () =>
            saveParticipants($('participants-text').value.split(/\r?\n/)));
        $('participants-clear').addEventListener('click', () => {
            if (!confirm('参加者リストを空にします。よろしいですか？')) return;
            saveParticipants([]);
        });

        render();
        fetchBackendInfo();

        try {
            const data = await api('GET', '/api/state');
            applyState(data.state);
            $('participants-text').value = state.participants.join('\n');
        } catch (error) {
            showNotice('保存済みの状態を読み込めませんでした', 'error');
        }
        render();
        $('guest-name').focus();
    }

    document.addEventListener('DOMContentLoaded', init);
})();

// Made with Bob
