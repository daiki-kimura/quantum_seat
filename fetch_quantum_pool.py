"""
量子乱数（乱数マップ）を IBM Quantum の実機から事前に取得し、乱数プールに追加するスクリプト

受付のたびに実機でジョブを流すと待ち時間が長いため、イベントの前にこのスクリプトで
まとめて取得しておく。アプリは受付時にプール（data/random_pool.json）から読み出すだけ。

1つの「乱数マップ」= 量子ビット数ぶんのHゲート＋測定を1ショット実行した結果（既定100ビット）。
既定では100マップ（= 10,000ビット）を1ジョブで取得する。

使い方:
    python fetch_quantum_pool.py [--maps 100] [--qubits 100] [--backend 名前]

バックエンドを指定しない場合は、アカウントで使える実機のうち待ち行列が最も短いものを自動選択する。
"""
import argparse
import sys
import time
from datetime import datetime, timezone

from qiskit import QuantumCircuit
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

from config import Config
from quantum.random_pool import RandomPool

POLL_SECONDS = 10


def select_backend(service, name, min_qubits):
    """使うバックエンドを決める（指定がなければ待ち行列が最も短い実機）"""
    backends = service.backends(simulator=False, operational=True, min_num_qubits=min_qubits)
    if not backends:
        raise SystemExit('利用できる実機がありません')

    pending = {b.name: b.status().pending_jobs for b in backends}
    print('利用可能な実機:')
    for backend in sorted(backends, key=lambda b: pending[b.name]):
        print(f'  - {backend.name}: {backend.num_qubits}量子ビット, '
              f'待ちジョブ {pending[backend.name]}件')

    if name:
        for backend in backends:
            if backend.name == name:
                return backend
        raise SystemExit(f'指定の実機 {name} は利用できません')
    return min(backends, key=lambda b: pending[b.name])


def main():
    parser = argparse.ArgumentParser(description='量子乱数を実機から取得してプールに追加する')
    parser.add_argument('--maps', type=int, default=100, help='取得する乱数マップの数（既定100）')
    parser.add_argument('--qubits', type=int, default=100, help='1マップあたりの量子ビット数（既定100）')
    parser.add_argument('--backend', default=Config.IBM_QUANTUM_BACKEND or None,
                        help='使う実機（既定: .envのIBM_QUANTUM_BACKEND、空なら待ち行列が最短のもの）')
    args = parser.parse_args()
    if not 1 <= args.maps <= 10000 or not 1 <= args.qubits <= 156:
        raise SystemExit('--maps は1〜10000、--qubits は1〜156で指定してください')
    if not Config.IBM_QUANTUM_TOKEN:
        raise SystemExit('.env に IBM_QUANTUM_TOKEN を設定してください')

    service = QiskitRuntimeService(
        channel='ibm_cloud',
        token=Config.IBM_QUANTUM_TOKEN,
        instance=Config.IBM_QUANTUM_INSTANCE or None)
    backend = select_backend(service, args.backend, args.qubits)
    print(f'\n使用する実機: {backend.name}')

    # 全量子ビットにHゲートをかけて測定するだけの回路（2量子ビットゲートなし）
    circuit = QuantumCircuit(args.qubits, args.qubits)
    circuit.h(range(args.qubits))
    circuit.measure(range(args.qubits), range(args.qubits))
    isa_circuit = generate_preset_pass_manager(
        optimization_level=1, backend=backend).run(circuit)

    job = SamplerV2(mode=backend).run([isa_circuit], shots=args.maps)
    print(f'ジョブを投入しました: {job.job_id()}')

    started = time.time()
    last_status = None
    while True:
        status = str(job.status())
        if status != last_status:
            print(f'  [{int(time.time() - started):4d}秒] {status}', flush=True)
            last_status = status
        if status in ('DONE', 'ERROR', 'CANCELLED'):
            break
        time.sleep(POLL_SECONDS)

    result = job.result()
    # 1ショット = 1マップ。ショットの順番のまま連結する
    maps = result[0].data.c.get_bitstrings()
    bits = ''.join(maps)
    ones = bits.count('1')
    print(f'\n取得: {len(maps)}マップ x {args.qubits}ビット = {len(bits)}ビット')
    print(f'1の割合: {ones / len(bits):.4f}（理想 0.5000）')

    pool = RandomPool(Config.POOL_FILE)
    pool.add_batch(bits, {
        'backend': backend.name,
        'job_id': job.job_id(),
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'maps': len(maps),
        'qubits': args.qubits,
    })
    status = pool.status()
    print(f'プールに追加しました: 残り {status["remaining_bits"]} / {status["total_bits"]} ビット'
          f'（{Config.POOL_FILE}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
