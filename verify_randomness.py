"""
乱数プールの簡易検証スクリプト

data/random_pool.json（実機から事前に取得した量子乱数）を読み取り専用で調べ、
次の項目を統計的に確認する。プールのファイルは変更しない（乱数を消費しない）。

1. 生ビットの偏り（1の割合・ランの数・4ビットごとの値の分布）
2. 受付で使う「0..n-1 の乱数を1つ」の一様性（プールのコピーから抽選）

使い方:
    python verify_randomness.py [抽選回数]
"""
import collections
import math
import os
import sys
import tempfile

from config import Config
from quantum import RandomPool

# カイ二乗分布の上側1%点（自由度 -> 臨界値）。これを超えたら偏りの疑いあり
CHI2_CRITICAL_1PCT = {6: 16.812, 15: 30.578}


def chi_square(observed):
    expected = sum(observed) / len(observed)
    return sum((o - expected) ** 2 / expected for o in observed)


def report(label, observed):
    stat = chi_square(observed)
    critical = CHI2_CRITICAL_1PCT[len(observed) - 1]
    verdict = 'OK' if stat < critical else '偏りの疑いあり'
    print(f'{label}: counts={observed} chi2={stat:.2f} (臨界値 {critical}) -> {verdict}')


def z_verdict(z):
    """z値が絶対値2.58（両側1%）未満ならOK"""
    return 'OK' if abs(z) < 2.58 else '偏りの疑いあり'


def main():
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 700

    pool = RandomPool(Config.POOL_FILE)
    status = pool.status()
    if status['total_bits'] == 0:
        print('乱数プールが空です。先に fetch_quantum_pool.py で取得してください')
        return 1
    print(f'乱数プール: {status["backend"]}で取得（{status["fetched_at"]}）'
          f' 残り {status["remaining_bits"]} / {status["total_bits"]} ビット')

    bits = pool.unused_bits()
    n = len(bits)
    if n < 4 * draws:
        print('未使用のビットが少なすぎて検証できません')
        return 1

    # 1. 生ビット
    ones = bits.count('1')
    z = (ones - n / 2) / math.sqrt(n / 4)
    print(f'1の割合 = {ones / n:.4f}（理想 0.5000, {n}ビット, z={z:.2f}） -> {z_verdict(z)}')

    runs = 1 + sum(bits[i] != bits[i + 1] for i in range(n - 1))
    expected = 1 + 2 * ones * (n - ones) / n
    variance = 2 * ones * (n - ones) * (2 * ones * (n - ones) - n) / (n * n * (n - 1))
    z_runs = (runs - expected) / math.sqrt(variance)
    print(f'ラン数 = {runs}（期待値 {expected:.0f}, z={z_runs:.2f}） -> {z_verdict(z_runs)}')

    blocks = collections.Counter(int(bits[i:i + 4], 2) for i in range(0, n - 3, 4))
    report('4ビットの値 0..15', [blocks.get(i, 0) for i in range(16)])

    # 2. アプリが使う抽選（空席数7を想定）。プールを消費しないよう一時コピーで行う
    copy = RandomPool(os.path.join(tempfile.mkdtemp(), 'pool.json'))
    copy.add_batch(bits, {'backend': status['backend']})
    seats = 7
    results = collections.Counter(copy.take_below(seats) for _ in range(draws))
    report(f'抽選 0..{seats - 1} x{draws}', [results.get(i, 0) for i in range(seats)])
    return 0


if __name__ == '__main__':
    sys.exit(main())
