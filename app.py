"""
Quantum Seat - IBM Quantumを使用した受付型の席決めアプリケーション

来場者が1名ずつ受付に来るたびに、量子乱数で空席から席を決める。
"""
import logging
import os

from flask import Flask, g, jsonify, render_template, request

from config import Config
from quantum import QuantumRandomGenerator, RandomPool
from seat_store import SeatStore, ValidationError

# ロギング設定（秒を含む時刻フォーマット）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Flaskアプリケーションの初期化
app = Flask(__name__)
app.config.from_object(Config)

# 席の状態ストア（レイアウトと着席状況）
store = SeatStore(app.config['STATE_FILE'])

# 量子乱数生成器の初期化
quantum_generator = None


def get_quantum_generator():
    """量子乱数生成器のシングルトンインスタンスを取得"""
    global quantum_generator
    if quantum_generator is None:
        quantum_generator = QuantumRandomGenerator(RandomPool(app.config['POOL_FILE']))
    return quantum_generator


def random_method():
    """
    このリクエストで実際に使われた乱数の種類と、乱数を取得した実機名を返す

    method: 'quantum'（事前に実機で取得した量子乱数）, 'pseudo'（プール切れによる疑似乱数）。
            複数回生成した場合は、1回でも疑似乱数が混ざれば 'pseudo'。
    """
    generator = get_quantum_generator()
    used = getattr(g, 'random_methods', None) or [generator.last_method]
    method = 'pseudo' if 'pseudo' in used else 'quantum'
    return method, generator.pool.status()['backend'] or 'None'


def choose_index(n):
    """0からn-1の範囲で量子乱数を1つ取得する"""
    if n <= 1:
        return 0
    generator = get_quantum_generator()
    value = generator.generate_random_numbers(1, n - 1)[0]
    if not hasattr(g, 'random_methods'):
        g.random_methods = []
    g.random_methods.append(generator.last_method)
    return value


def json_body():
    """リクエストのJSONボディ（オブジェクト）を取得。不正なら入力エラー"""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError('リクエストの形式が不正です')
    return data


def api_error(error, log_message):
    """例外をレスポンスに変換する（内部エラーの詳細はクライアントに返さない）"""
    if isinstance(error, ValidationError):
        return jsonify({'success': False, 'error': str(error)}), 400
    app.logger.error(log_message, exc_info=True)
    return jsonify({'success': False, 'error': '内部エラーが発生しました'}), 500


@app.route('/')
def index():
    """メイン画面"""
    return render_template('index.html')


@app.route('/about')
def about():
    """量子乱数の仕組みの説明ページ"""
    return render_template('about.html')


@app.route('/api/state', methods=['GET'])
def get_state():
    """レイアウトと着席状況を取得"""
    return jsonify({'success': True, 'state': store.snapshot()})


@app.route('/api/layout', methods=['PUT'])
def update_layout():
    """
    会場レイアウト（机・座席）を保存

    Request JSON:
        tables: [{id, shape(rect/ellipse/polygon), x, y, w, h | points}]
        seats: [{id, x, y, label}]
        annotations: [{id, type(text/arrow/line), ...}]（省略すると保存済みの書き込みを残す）
    """
    try:
        data = json_body()
        state = store.set_layout(data.get('tables'), data.get('seats'), data.get('annotations'))
        return jsonify({'success': True, 'state': state})
    except Exception as e:
        return api_error(e, 'レイアウト保存エラー')


@app.route('/api/participants', methods=['PUT'])
def update_participants():
    """
    名前の入力候補（参加者リスト）を上書き保存

    Request JSON:
        names: 名前の配列
    """
    try:
        data = json_body()
        return jsonify({'success': True, 'state': store.set_participants(data.get('names'))})
    except Exception as e:
        return api_error(e, '参加者リスト保存エラー')


@app.route('/api/checkin', methods=['POST'])
def check_in():
    """
    受付: 1名分の席を量子乱数で空席から決める

    Request JSON:
        name: 来場者の名前
    """
    try:
        data = json_body()
        pool = get_quantum_generator().pool
        with store.lock:
            bits_before = pool.remaining_bits()
            result = store.check_in(data.get('name'), choose_index)
            method, backend = random_method()
            bits_used = bits_before - pool.remaining_bits()
        return jsonify({
            'success': True,
            'assignment': result['assignment'],
            'seat': result['seat'],
            'state': result['state'],
            'method': method,
            'backend': backend,
            'bits_used': bits_used,
            'pool': pool.status()
        })
    except Exception as e:
        return api_error(e, '受付エラー')


@app.route('/api/checkin-all', methods=['POST'])
def check_in_all():
    """受付（一括）: 参加者リストの未着席の全員を、量子乱数で空席にまとめて割り当てる"""
    try:
        pool = get_quantum_generator().pool
        with store.lock:
            bits_before = pool.remaining_bits()
            result = store.check_in_all(choose_index)
            method, backend = random_method()
            bits_used = bits_before - pool.remaining_bits()
        return jsonify({
            'success': True,
            'assignments': result['assignments'],
            'state': result['state'],
            'method': method,
            'backend': backend,
            'bits_used': bits_used,
            'pool': pool.status()
        })
    except Exception as e:
        return api_error(e, '一括受付エラー')


@app.route('/api/checkout', methods=['POST'])
def check_out():
    """着席の取り消し（受付ミスの訂正用）

    Request JSON:
        seat_id: 取り消す席のID
    """
    try:
        data = json_body()
        seat_id = data.get('seat_id')
        if isinstance(seat_id, bool) or not isinstance(seat_id, int):
            raise ValidationError('席の指定が不正です')
        return jsonify({'success': True, 'state': store.check_out(seat_id)})
    except Exception as e:
        return api_error(e, '取り消しエラー')


@app.route('/api/reshuffle', methods=['POST'])
def reshuffle():
    """着席済みの全員を量子乱数で配置換え"""
    try:
        pool = get_quantum_generator().pool
        with store.lock:
            bits_before = pool.remaining_bits()
            state = store.reshuffle(choose_index)
            method, backend = random_method()
            bits_used = bits_before - pool.remaining_bits()
        return jsonify({
            'success': True,
            'state': state,
            'method': method,
            'backend': backend,
            'bits_used': bits_used,
            'pool': pool.status()
        })
    except Exception as e:
        return api_error(e, '配置換えエラー')


@app.route('/api/reset', methods=['POST'])
def reset():
    """着席状況を全てリセット（会場レイアウトは残す）"""
    try:
        return jsonify({'success': True, 'state': store.reset_assignments()})
    except Exception as e:
        return api_error(e, 'リセットエラー')


@app.route('/api/generate-random', methods=['POST'])
def generate_random():
    """
    量子乱数を生成するAPIエンドポイント

    Request JSON:
        count: 生成する乱数の個数
        max_value: 乱数の最大値

    Response JSON:
        success: 成功フラグ
        random_numbers: 生成された乱数のリスト
        method: 使用した生成方法（quantum/pseudo）
    """
    try:
        data = json_body()
        count = data.get('count', 10)
        max_value = data.get('max_value', 100)

        # 入力検証
        if (isinstance(count, bool) or not isinstance(count, int)
                or count <= 0 or count > 1000):
            raise ValidationError('乱数の個数は1から1000の間で指定してください')

        if (isinstance(max_value, bool) or not isinstance(max_value, int)
                or not 0 < max_value <= 10000):
            raise ValidationError('最大値は1から10000の間で指定してください')

        # 量子乱数を生成
        generator = get_quantum_generator()
        random_numbers = generator.generate_random_numbers(count, max_value)
        g.random_methods = [generator.last_method]
        method, backend = random_method()

        return jsonify({
            'success': True,
            'random_numbers': random_numbers,
            'method': method,
            'backend': backend
        })

    except Exception as e:
        return api_error(e, '乱数生成エラー')


@app.route('/api/backend-info', methods=['GET'])
def backend_info():
    """
    量子乱数プール（事前に実機で取得した乱数）の状態を取得

    Response JSON:
        success: 成功フラグ
        pool: {backend, fetched_at, total_bits, remaining_bits, batches}
    """
    try:
        return jsonify({
            'success': True,
            'pool': get_quantum_generator().pool.status()
        })

    except Exception as e:
        return api_error(e, 'バックエンド情報取得エラー')


@app.errorhandler(404)
def not_found(error):
    """404エラーハンドラ"""
    return render_template('404.html'), 404


@app.errorhandler(500)
def internal_error(error):
    """500エラーハンドラ"""
    app.logger.error(f"Internal error: {error}")
    return render_template('500.html'), 500


if __name__ == '__main__':
    # 開発サーバーを起動
    # ポート番号は環境変数で指定可能（デフォルト: 5001）
    # macOSではポート5000がAirPlayで使用されている場合があります
    port = int(os.getenv('FLASK_PORT', 5001))
    # セキュリティのためローカルホストのみにバインドし、デバッグモードは明示的に有効化した場合のみ
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug, host='127.0.0.1', port=port)

# Made with Bob
