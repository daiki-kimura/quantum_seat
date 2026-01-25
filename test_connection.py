"""
IBM Quantum接続テストスクリプト
"""
import os

from dotenv import load_dotenv

# 環境変数を読み込む
load_dotenv()

print("=" * 60)
print("IBM Quantum 接続テスト")
print("=" * 60)
print()

# 1. 環境変数の確認
token = os.getenv('IBM_QUANTUM_TOKEN')
instance = os.getenv('IBM_QUANTUM_INSTANCE')
print("1. 環境変数の確認")
print(f"   トークンが設定されている: {'はい' if token else 'いいえ'}")
if token:
    print(f"   トークンの長さ: {len(token)} 文字")
    print(f"   トークンの先頭: {token[:10]}...")
print(f"   インスタンス(CRN)が設定されている: {'はい' if instance else 'いいえ'}")
if instance:
    print(f"   インスタンス: {instance[:60]}...")
print()

# 2. Qiskitのインポート確認
print("2. Qiskitのインポート確認")
try:
    import qiskit
    print(f"   ✅ Qiskit バージョン: {qiskit.__version__}")
except ImportError as e:
    print(f"   ❌ Qiskitのインポートに失敗: {e}")
    exit(1)
print()

# 3. IBM Quantum Runtimeのインポート確認
print("3. IBM Quantum Runtimeのインポート確認")
try:
    from qiskit_ibm_runtime import QiskitRuntimeService
    print("   ✅ qiskit-ibm-runtime インポート成功")
except ImportError as e:
    print(f"   ❌ qiskit-ibm-runtimeのインポートに失敗: {e}")
    exit(1)
print()

# 4. IBM Quantumへの接続テスト
print("4. IBM Quantumへの接続テスト")
if not token:
    print("   ⚠️  トークンが設定されていません")
    exit(1)

try:
    print("   接続を試行中...")

    # サービス接続のパラメータを準備
    service_params = {
        "channel": "ibm_cloud",
        "token": token
    }

    # インスタンス（CRN）が指定されている場合は追加
    if instance:
        service_params["instance"] = instance
        print(f"   インスタンスを指定: {instance[:60]}...")

    service = QiskitRuntimeService(**service_params)
    print("   ✅ IBM Quantum Serviceに接続成功！")
    print()

    # 5. 利用可能なバックエンドを確認
    print("5. 利用可能なバックエンドの確認")
    backends = service.backends()
    print(f"   利用可能なバックエンド数: {len(backends)}")

    if backends:
        print("   バックエンド一覧:")
        for backend in backends[:5]:  # 最初の5つを表示
            print(f"     - {backend.name}")
        if len(backends) > 5:
            print(f"     ... 他 {len(backends) - 5} 個")

    print()
    print("=" * 60)
    print("✅ すべてのテストに成功しました！")
    print("=" * 60)

except Exception as e:
    print(f"   ❌ 接続に失敗: {e}")
    print()
    print("考えられる原因:")
    print("  1. トークンが無効または期限切れ")
    print("  2. インターネット接続の問題")
    print("  3. IBM Quantumサービスの一時的な問題")
    print()
    print("解決方法:")
    print("  1. IBM Quantum Experience (https://quantum.ibm.com/) で")
    print("     新しいトークンを生成してください")
    print("  2. インターネット接続を確認してください")
    print("  3. しばらく待ってから再試行してください")
    print()
    print("注意: トークンなしでもローカルシミュレーターで動作します")

# Made with Bob
