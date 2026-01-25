"""
IBM Quantumを使用した真の乱数生成モジュール
"""
import logging
import math
import random
from typing import List, Optional

from qiskit import QuantumCircuit, transpile
from qiskit.providers import BackendV2
from qiskit_ibm_runtime import QiskitRuntimeService, Sampler, Session

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QuantumRandomGenerator:
    """IBM Quantumを使用した乱数生成クラス"""

    def __init__(self, token: Optional[str] = None, backend_name: Optional[str] = None):
        """
        初期化

        Args:
            token: IBM Quantum APIトークン
            backend_name: 使用するバックエンド名（Noneの場合は自動選択）
        """
        self.token = token
        self.backend_name = backend_name
        self.service = None
        self.backend = None
        self._initialize_service()

    def _initialize_service(self):
        """IBM Quantumサービスの初期化"""
        try:
            if self.token:
                # トークンを使用してサービスに接続
                self.service = QiskitRuntimeService(
                    channel="ibm_quantum",
                    token=self.token
                )
                logger.info("IBM Quantum Serviceに接続しました")

                # バックエンドの選択
                if self.backend_name:
                    self.backend = self.service.backend(self.backend_name)
                else:
                    # 利用可能なシミュレーターを自動選択
                    self.backend = self._select_best_backend()

                if self.backend:
                    logger.info(f"バックエンド '{self.backend.name}' を使用します")
            else:
                logger.warning("IBM Quantum トークンが設定されていません。ローカルシミュレーターを使用します")
                self._use_local_simulator()

        except Exception as e:
            logger.error(f"IBM Quantum Serviceの初期化に失敗: {e}")
            logger.info("ローカルシミュレーターにフォールバックします")
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
            logger.info("ローカルのAerSimulatorを使用します")
        except ImportError:
            logger.warning("Aer Simulatorが利用できません。疑似乱数を使用します")
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
                with Session(service=self.service, backend=self.backend) as session:
                    sampler = Sampler(session=session)
                    job = sampler.run(circuit, shots=shots)
                    result = job.result()

                    # 結果から乱数を抽出
                    quasi_dists = result.quasi_dists[0]
                    for bitstring, probability in quasi_dists.items():
                        if len(random_numbers) >= count:
                            break
                        value = int(bitstring)
                        if value <= max_value:
                            # 確率に応じて複数回追加
                            num_samples = int(probability * shots)
                            for _ in range(num_samples):
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
        random_indices = self.generate_random_numbers(n - 1, n - 1)

        # シャッフルを実行
        shuffled = items.copy()
        for i in range(n - 1, 0, -1):
            j = random_indices[n - 1 - i] % (i + 1)
            shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

        return shuffled

# Made with Bob
