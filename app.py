"""
Quantum Seat - IBM Quantumを使用した席替えアプリケーション
"""
import json
import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request, session

from config import Config
from quantum import QuantumRandomGenerator

# Flaskアプリケーションの初期化
app = Flask(__name__)
app.config.from_object(Config)

# 量子乱数生成器の初期化
quantum_generator = None


def get_quantum_generator():
    """量子乱数生成器のシングルトンインスタンスを取得"""
    global quantum_generator
    if quantum_generator is None:
        token = app.config.get('IBM_QUANTUM_TOKEN')
        instance = app.config.get('IBM_QUANTUM_INSTANCE')
        quantum_generator = QuantumRandomGenerator(
            token=token, instance=instance)
    return quantum_generator


def load_participants_from_file(filename='participants.txt'):
    """
    テキストファイルから参加者リストを読み込む

    Args:
        filename: 参加者リストファイル名

    Returns:
        参加者名のリスト
    """
    participants = []
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # 空行とコメント行をスキップ
                if line and not line.startswith('#'):
                    participants.append(line)
        app.logger.info(f"participants.txtから{len(participants)}名を読み込みました")
    except FileNotFoundError:
        app.logger.warning(f"{filename}が見つかりません。デフォルト値を使用します")
    except Exception as e:
        app.logger.error(f"参加者ファイルの読み込みエラー: {e}")

    return participants


@app.route('/')
def index():
    """メイン画面"""
    # participants.txtから参加者を読み込む
    participants = load_participants_from_file()

    return render_template('index.html',
                           default_participants=app.config['DEFAULT_PARTICIPANTS'],
                           participants=participants)


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
        data = request.get_json()
        count = data.get('count', 10)
        max_value = data.get('max_value', 100)

        # 入力検証
        if count <= 0 or count > 1000:
            return jsonify({
                'success': False,
                'error': '乱数の個数は1から1000の間で指定してください'
            }), 400

        if max_value <= 0:
            return jsonify({
                'success': False,
                'error': '最大値は正の整数を指定してください'
            }), 400

        # 量子乱数を生成
        generator = get_quantum_generator()
        random_numbers = generator.generate_random_numbers(count, max_value)

        # 使用した方法を判定
        method = 'quantum' if generator.backend is not None else 'pseudo'

        return jsonify({
            'success': True,
            'random_numbers': random_numbers,
            'method': method,
            'backend': generator.backend.name if generator.backend else 'None'
        })

    except Exception as e:
        app.logger.error(f"乱数生成エラー: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/shuffle-seats', methods=['POST'])
def shuffle_seats():
    """
    席替えを実行するAPIエンドポイント

    Request JSON:
        participants: 参加者名のリスト
        seats: 座席情報のリスト [{id, x, y, label}]

    Response JSON:
        success: 成功フラグ
        assignments: 席割り当て結果 [{participant, seat}]
        method: 使用した生成方法
        timestamp: 実行時刻
    """
    try:
        data = request.get_json()
        participants = data.get('participants', [])
        seats = data.get('seats', [])

        # 入力検証
        if not participants:
            return jsonify({
                'success': False,
                'error': '参加者を入力してください'
            }), 400

        if not seats:
            return jsonify({
                'success': False,
                'error': '座席を配置してください'
            }), 400

        if len(participants) > len(seats):
            return jsonify({
                'success': False,
                'error': f'座席数（{len(seats)}）が参加者数（{len(participants)}）より少ないです'
            }), 400

        # 量子乱数を使用して参加者をシャッフル
        generator = get_quantum_generator()
        shuffled_participants = generator.shuffle_list(participants)

        # 座席に割り当て
        assignments = []
        for i, participant in enumerate(shuffled_participants):
            if i < len(seats):
                assignments.append({
                    'participant': participant,
                    'seat': seats[i]
                })

        # セッションに保存
        session['last_assignment'] = {
            'assignments': assignments,
            'timestamp': datetime.now().isoformat()
        }

        # 使用した方法を判定
        method = 'quantum' if generator.backend is not None else 'pseudo'

        return jsonify({
            'success': True,
            'assignments': assignments,
            'method': method,
            'backend': generator.backend.name if generator.backend else 'None',
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        app.logger.error(f"席替えエラー: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/get-last-assignment', methods=['GET'])
def get_last_assignment():
    """
    最後の席割り当て結果を取得

    Response JSON:
        success: 成功フラグ
        assignment: 席割り当て結果
    """
    try:
        last_assignment = session.get('last_assignment')

        if last_assignment:
            return jsonify({
                'success': True,
                'assignment': last_assignment
            })
        else:
            return jsonify({
                'success': False,
                'error': '席割り当て履歴がありません'
            }), 404

    except Exception as e:
        app.logger.error(f"履歴取得エラー: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/backend-info', methods=['GET'])
def backend_info():
    """
    使用中のQuantumバックエンド情報を取得

    Response JSON:
        success: 成功フラグ
        backend_name: バックエンド名
        is_quantum: 量子バックエンドかどうか
        token_configured: トークンが設定されているか
    """
    try:
        generator = get_quantum_generator()

        return jsonify({
            'success': True,
            'backend_name': generator.backend.name if generator.backend else 'None',
            'is_quantum': generator.backend is not None,
            'token_configured': bool(app.config.get('IBM_QUANTUM_TOKEN'))
        })

    except Exception as e:
        app.logger.error(f"バックエンド情報取得エラー: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


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
    app.run(debug=True, host='0.0.0.0', port=port)

# Made with Bob
