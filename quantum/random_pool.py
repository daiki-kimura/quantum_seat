"""
事前に取得した量子乱数（乱数マップ）のプール

IBM Quantumの実機で事前に取得した乱数ビットをファイルに保存しておき、
受付のときはそのファイルから順番に読み出して使う（読んだビットは二度と使わない）。

ファイル形式（JSON）:
    {
      "version": 1,
      "bits": "0110...",      # 未使用も含む全ビット（'0'/'1'の文字列）
      "cursor": 0,            # bits のうち、使用済みのビット数
      "batches": [{"backend", "job_id", "fetched_at", "maps", "qubits", "bits"}, ...]
    }
"""
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

POOL_VERSION = 1


class PoolExhausted(Exception):
    """プールの未使用ビットが足りない"""


class RandomPool:
    """乱数ビットのプール（ファイルに永続化し、読み出し位置も保存する）"""

    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._bits = ''
        self._cursor = 0
        self._batches: List[Dict[str, Any]] = []
        self._load()

    # ---- 永続化 ----

    def _load(self) -> None:
        if not os.path.isfile(self.path):
            return
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            bits = data.get('bits', '')
            cursor = data.get('cursor', 0)
            batches = data.get('batches', [])
            if (not isinstance(bits, str) or set(bits) - {'0', '1'}
                    or isinstance(cursor, bool) or not isinstance(cursor, int)
                    or not 0 <= cursor <= len(bits) or not isinstance(batches, list)):
                raise ValueError('プールファイルの内容が不正です')
            self._bits, self._cursor, self._batches = bits, cursor, batches
        except Exception:
            # 壊れたファイルは使わない（上書きもしない）。プールは空として扱う
            logger.error('乱数プールを読み込めませんでした: %s', self.path, exc_info=True)

    def _save(self) -> None:
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp_path = self.path + '.tmp'
        data = {
            'version': POOL_VERSION,
            'bits': self._bits,
            'cursor': self._cursor,
            'batches': self._batches,
        }
        # 乱数そのものなので、本人だけが読み書きできる権限で保存する
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        os.replace(tmp_path, self.path)

    # ---- 読み出し ----

    def remaining_bits(self) -> int:
        with self._lock:
            return len(self._bits) - self._cursor

    def unused_bits(self) -> str:
        """未使用のビット列（検証用。読み出し位置は進めない）"""
        with self._lock:
            return self._bits[self._cursor:]

    def take_below(self, n: int) -> int:
        """
        0以上n未満の一様な整数を、プールの未使用ビットから1つ取り出す

        必要なビット数だけ読み、n以上になったら読み捨てて引き直す（棄却サンプリング）。
        読んだビットは（捨てた分も含めて）使用済みになる。

        Raises:
            PoolExhausted: 未使用ビットが足りない
        """
        if n <= 1:
            return 0
        width = (n - 1).bit_length()
        with self._lock:
            cursor = self._cursor
            try:
                while True:
                    if cursor + width > len(self._bits):
                        raise PoolExhausted('乱数プールの残りが足りません')
                    value = int(self._bits[cursor:cursor + width], 2)
                    cursor += width
                    if value < n:
                        return value
            finally:
                if cursor != self._cursor:
                    self._cursor = cursor
                    self._save()

    # ---- 追加 ----

    def add_batch(self, bits: str, meta: Dict[str, Any]) -> None:
        """新しく取得したビットを追加する（使用済みの分は捨てる）"""
        if not bits or set(bits) - {'0', '1'}:
            raise ValueError('ビット列が不正です')
        with self._lock:
            self._bits = self._bits[self._cursor:] + bits
            self._cursor = 0
            self._batches.append({**meta, 'bits': len(bits)})
            self._save()

    # ---- 状態 ----

    def status(self) -> Dict[str, Any]:
        """画面表示用のプールの状態"""
        with self._lock:
            last: Optional[Dict[str, Any]] = self._batches[-1] if self._batches else None
            return {
                'total_bits': len(self._bits),
                'remaining_bits': len(self._bits) - self._cursor,
                'backend': last.get('backend') if last else None,
                'fetched_at': last.get('fetched_at') if last else None,
                'batches': len(self._batches),
            }
