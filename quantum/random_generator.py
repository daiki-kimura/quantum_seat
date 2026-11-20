"""
事前に取得した量子乱数（乱数マップ）を使う乱数生成モジュール

乱数は IBM Quantum の実機で事前に取得してプール（quantum/random_pool.py）に保存しておき、
受付のときはそこから読み出すだけにする。受付中にIBM Quantumへは接続しない。
プールが空になった場合は疑似乱数にフォールバックし、last_method で呼び出し側に伝える。
"""
import logging
import random
from typing import List, Optional

from .random_pool import PoolExhausted, RandomPool

logger = logging.getLogger(__name__)


class QuantumRandomGenerator:
    """乱数プールから量子乱数を読み出して返すクラス"""

    def __init__(self, pool: RandomPool):
        self.pool = pool
        # 直近の生成方法: 'quantum'（プールの量子乱数）, 'pseudo'（疑似乱数）
        self.last_method: Optional[str] = None

    def generate_random_numbers(self, count: int, max_value: int) -> List[int]:
        """
        0以上max_value以下の乱数をcount個生成する

        プールの量子乱数を使い、足りなければ疑似乱数で補う（その場合 last_method は 'pseudo'）。
        """
        numbers = []
        self.last_method = 'quantum'
        for _ in range(count):
            try:
                numbers.append(self.pool.take_below(max_value + 1))
            except PoolExhausted:
                logger.warning('乱数プールが空です。疑似乱数を使用します')
                self.last_method = 'pseudo'
                numbers.append(random.SystemRandom().randint(0, max_value))
        return numbers

    def shuffle_list(self, items: List) -> List:
        """量子乱数でリストをシャッフルする（Fisher-Yates）"""
        shuffled = items.copy()
        for i in range(len(shuffled) - 1, 0, -1):
            j = self.generate_random_numbers(1, i)[0]
            shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
        return shuffled

# Made with Bob
