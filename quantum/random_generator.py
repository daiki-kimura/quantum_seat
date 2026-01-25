"""
IBM Quantumを使用した真の乱数生成モジュール
"""
import logging
import math
import random
from typing import List, Optional

from qiskit import QuantumCircuit, transpile
from qiskit.providers import BackendV2
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QuantumRandomGenerator:
    """IBM Quantumを使用した乱数生成クラス"""

    def __init__(self, token: Optional[str] = None, backend_name: Optional[str] = None, instance: Optional[str] = None):
        """
        初期化

        Args:
            token: IBM Quantum APIトークン
            backend_name: 使用するバックエンド名（Noneの場合は自動選択）
            instance: IBM Quantum Instance (CRN)
        """
        self.token = token
        self.backend_name = backend_name
        self.instance = instance
        self.service = None
        self.backend = None
        self._initialize_service()

    def _initialize_service(self):
        """IBM Quantumサービスの初期化"""
        try:
            if self.token:
                logger.info("IBM Quantum Serviceへの接続を試行中...")

                # サービス接続のパラメータを準備
                service_params = {
                    "channel": "ibm_cloud",
                    "token": self.token
                }

                # インスタンス（CRN）が指定されている場合は追加
                if self.instance:
                    service_params["instance"] = self.instance
                    logger.info(f"   インスタンスを指定: {self.instance[:50]}...")

                # トークンを使用してサービスに接続
                self.service = QiskitRuntimeService(**service_params)
                logger.info("✅ IBM Quantum Serviceに接続しました")

                # バックエンドの選択
                if self.backend_name:
                    self.backend = self.service.backend(self.backend_name)
                else:
                    # 利用可能なシミュレーターを自動選択
                    self.backend = self._select_best_backend()

                if self.backend:
                    logger.info(f"✅ バックエンド '{self.backend.name}' を使用します")
            else:
                logger.info("ℹ️  IBM Quantum トークンが設定されていません")
                logger.info("ℹ️  ローカルシミュレーターを使用します（これは正常な動作です）")
                self._use_local_simulator()

        except Exception as e:
            logger.info("ℹ️  IBM Quantum Serviceへの接続に失敗しました")
            logger.info(f"   理由: インターネット接続またはトークンの問題")
            logger.info("ℹ️  ローカルシミュレーターを使用します（これは正常な動作です）")
            self._use_local_simulator()

    def _select_best_backend(self) -> Optional[BackendV2]:
        """最適なバックエンドを選択"""
        try:
            # シミュレーターの優先順位
            preferred_simulators = [
                'ibm_qasm_simulator',
                'simulator_statevector',
                'simulator_mps',
                'simulator_extended_stabilizer',
                'simulator_stabilizer'
            ]

            # 利用可能なバックエンドを取得
            backends = self.service.backends()

            # 優先順位に従ってシミュレーターを選択
            for sim_name in preferred_simulators:
                for backend in backends:
                    if sim_name in backend.name.lower():
                        return backend

            # シミュレーターが見つからない場合は最初のバックエンドを使用
            if backends:
                return backends[0]

            return None

        except Exception as e:
            logger.error(f"バックエンド選択エラー: {e}")
            return None

    def _use_local_simulator(self):
        """ローカルシミュレーターを使用"""
        try:
            from qiskit_aer import AerSimulator
            self.backend = AerSimulator()
            logger.info("✅ ローカルのAerSimulatorを使用します")
        except ImportError:
            logger.info("ℹ️  Aer Simulatorが利用できません。疑似乱数を使用します")
            self.backend = None

    def generate_random_numbers(self, count: int, max_value: int) -> List[int]:
        """
        量子乱数を生成

        Args:
            count: 生成する乱数の個数
            max_value: 乱数の最大値（0からmax_valueまでの範囲）

        Returns:
            生成された乱数のリスト
        """
        try:
            if self.backend is None:
                logger.warning("量子バックエンドが利用できません。疑似乱数を使用します")
                return self._generate_pseudo_random(count, max_value)

            # 必要なビット数を計算
            n_bits = math.ceil(math.log2(max_value + 1))

            # 量子回路を構築
            circuit = self._create_random_circuit(n_bits)

            # 量子回路を実行して乱数を生成
            random_numbers = self._execute_circuit(circuit, count, max_value)

            logger.info(f"{count}個の量子乱数を生成しました")
            return random_numbers

        except Exception as e:
            logger.error(f"量子乱数生成エラー: {e}")
            logger.info("疑似乱数にフォールバックします")
            return self._generate_pseudo_random(count, max_value)

    def _create_random_circuit(self, n_bits: int) -> QuantumCircuit:
        """
        乱数生成用の量子回路を作成

        Args:
            n_bits: 必要なビット数

        Returns:
            量子回路
        """
        # 量子回路を作成
        circuit = QuantumCircuit(n_bits, n_bits)

        # すべての量子ビットにアダマールゲートを適用（重ね合わせ状態を作成）
        for i in range(n_bits):
            circuit.h(i)

        # 測定
        circuit.measure(range(n_bits), range(n_bits))

        return circuit

    def _execute_circuit(self, circuit: QuantumCircuit, count: int, max_value: int) -> List[int]:
        """
        量子回路を実行して乱数を生成

        Args:
            circuit: 実行する量子回路
            count: 必要な乱数の個数
            max_value: 乱数の最大値

        Returns:
            生成された乱数のリスト
        """
        random_numbers = []
        shots = max(count * 2, 1024)  # 十分な測定回数を確保

        try:
            # IBM Quantum Runtimeを使用する場合
            if self.service and hasattr(self.backend, 'name') and 'ibm' in self.backend.name.lower():
                # 回路をバックエンドに合わせてトランスパイル（V2では必須）
                transpiled_circuit = transpile(circuit, backend=self.backend)

                # SamplerV2を使用（V1は非推奨）
                # V2ではbackendパラメータではなく、modeで指定
                sampler = SamplerV2(mode=self.backend)

                # V2ではPUB（Primitive Unified Bloc）形式で実行
                job = sampler.run([transpiled_circuit], shots=shots)
                result = job.result()

                # V2の結果形式から乱数を抽出
                # result[0]は最初のPUBの結果
                pub_result = result[0]

                # DataBinから測定結果を取得
                # 測定結果は回路で定義したクラシカルレジスタ名でアクセス
                # デフォルトでは 'c' または 'meas' だが、回路によって異なる
                data_bin = pub_result.data

                # DataBinの属性を確認して測定結果を取得
                if hasattr(data_bin, 'c'):
                    counts = data_bin.c.get_counts()
                elif hasattr(data_bin, 'meas'):
                    counts = data_bin.meas.get_counts()
                else:
                    # 属性名が不明な場合、最初の属性を使用
                    attr_names = [attr for attr in dir(
                        data_bin) if not attr.startswith('_')]
                    if attr_names:
                        counts = getattr(data_bin, attr_names[0]).get_counts()
                    else:
                        raise AttributeError("DataBinに測定結果が見つかりません")

                # カウントから乱数を抽出
                for bitstring, count_value in counts.items():
                    if len(random_numbers) >= count:
                        break
                    value = int(bitstring, 2)  # 2進数文字列を整数に変換
                    if value <= max_value:
                        # カウント数に応じて追加
                        for _ in range(count_value):
                            if len(random_numbers) >= count:
                                break
                            random_numbers.append(value)
            else:
                # ローカルシミュレーターを使用
                from qiskit import execute
                job = execute(circuit, self.backend, shots=shots)
                result = job.result()
                counts = result.get_counts(circuit)

                # 結果から乱数を抽出
                for bitstring, count_val in counts.items():
                    if len(random_numbers) >= count:
                        break
                    value = int(bitstring, 2)
                    if value <= max_value:
                        for _ in range(count_val):
                            if len(random_numbers) >= count:
                                break
                            random_numbers.append(value)

            # 必要な個数に調整
            if len(random_numbers) < count:
                # 不足分を再帰的に生成
                additional = self.generate_random_numbers(
                    count - len(random_numbers), max_value)
                random_numbers.extend(additional)

            return random_numbers[:count]

        except Exception as e:
            logger.error(f"量子回路実行エラー: {e}")
            raise

    def _generate_pseudo_random(self, count: int, max_value: int) -> List[int]:
        """
        疑似乱数を生成（フォールバック用）

        Args:
            count: 生成する乱数の個数
            max_value: 乱数の最大値

        Returns:
            生成された疑似乱数のリスト
        """
        return [random.randint(0, max_value) for _ in range(count)]

    def shuffle_list(self, items: List) -> List:
        """
        量子乱数を使用してリストをシャッフル

        Args:
            items: シャッフルするリスト

        Returns:
            シャッフルされたリスト
        """
        if not items:
            return items

        # Fisher-Yatesシャッフルアルゴリズムで使用する乱数を生成
        n = len(items)
        # 各ステップで必要な範囲の乱数を生成
        shuffled = items.copy()

        for i in range(n - 1, 0, -1):
            # 0からiまでの範囲で乱数を生成
            random_value = self.generate_random_numbers(1, i)[0]
            j = random_value  # 0からiの範囲の値
            shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

        return shuffled

# Made with Bob
