"""
アプリケーション設定ファイル
"""
import os

from dotenv import load_dotenv

# .envファイルから環境変数を読み込む
load_dotenv()


class Config:
    """アプリケーション設定クラス"""

    # Flask設定
    SECRET_KEY = os.getenv(
        'FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

    # IBM Quantum設定
    IBM_QUANTUM_TOKEN = os.getenv('IBM_QUANTUM_TOKEN', '')
    IBM_QUANTUM_INSTANCE = os.getenv('IBM_QUANTUM_INSTANCE', '')  # CRN

    # 量子シミュレーター設定
    # 優先順位: ibm_qasm_simulator > aer_simulator > local simulator
    QUANTUM_BACKEND_PRIORITY = [
        'ibm_qasm_simulator',
        'aer_simulator',
        'qasm_simulator'
    ]

    # 量子回路設定
    QUANTUM_SHOTS = 1024  # 測定回数
    MAX_QUBITS = 10  # 使用する最大量子ビット数

    # アプリケーション設定
    DEFAULT_PARTICIPANTS = 18  # デフォルトの参加者数
    MAX_PARTICIPANTS = 100  # 最大参加者数

    # セッション設定
    SESSION_TYPE = 'filesystem'
    PERMANENT_SESSION_LIFETIME = 3600  # 1時間

# Made with Bob
