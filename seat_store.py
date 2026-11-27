"""
会場レイアウトと受付済みゲストの席割り当てを保持するストア

状態はメモリ上に保持し、変更のたびにJSONファイルへ原子的に保存する。
量子乱数の取得方法には依存せず、乱数は ``choose`` コールバックで受け取る。
"""
import copy
import json
import logging
import math
import os
import tempfile
import threading
from datetime import datetime
from typing import Callable, Dict, List

logger = logging.getLogger(__name__)

# 座席配置キャンバスのサイズ（フロントエンドと一致させる）
CANVAS_WIDTH = 800
CANVAS_HEIGHT = 600

MAX_TABLES = 100
MAX_SEATS = 300
MAX_ANNOTATIONS = 100
MAX_ANNOTATION_TEXT = 50
MIN_TEXT_SIZE = 10
MAX_TEXT_SIZE = 96
DEFAULT_TEXT_SIZE = 24
MIN_ARROW_LENGTH = 5
MAX_NAME_LENGTH = 50
MAX_PARTICIPANTS = 500
TABLE_SHAPES = ('rect', 'ellipse', 'polygon')
MIN_TABLE_SIZE = 10
MAX_TABLE_SIZE = 800
MIN_POLYGON_POINTS = 3
MAX_POLYGON_POINTS = 50

ChooseFunc = Callable[[int], int]


class ValidationError(Exception):
    """利用者に表示してよいメッセージを持つ入力エラー"""


def _number(value, low, high):
    """範囲内の数値であることを検証する（bool/NaNは拒否）"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError('レイアウトの値が不正です')
    if not low <= value <= high:
        raise ValidationError('レイアウトの値が範囲外です')
    return value


def _integer(value, low, high):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError('レイアウトの値が不正です')
    if not low <= value <= high:
        raise ValidationError('レイアウトの値が範囲外です')
    return value


def _clean_points(raw) -> List[Dict]:
    """多角形の頂点リストを検証する"""
    if (not isinstance(raw, list)
            or not MIN_POLYGON_POINTS <= len(raw) <= MAX_POLYGON_POINTS):
        raise ValidationError('多角形の頂点数が不正です')

    points = []
    for pt in raw:
        if not isinstance(pt, dict):
            raise ValidationError('多角形の頂点が不正です')
        points.append({
            'x': _number(pt.get('x'), 0, CANVAS_WIDTH),
            'y': _number(pt.get('y'), 0, CANVAS_HEIGHT),
        })
    return points


def _clean_tables(raw) -> List[Dict]:
    if not isinstance(raw, list) or len(raw) > MAX_TABLES:
        raise ValidationError('机の数が不正です')

    tables, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError('机のデータが不正です')
        table_id = _integer(item.get('id'), 1, 1_000_000)
        if table_id in seen:
            raise ValidationError('机のIDが重複しています')
        seen.add(table_id)

        shape = item.get('shape')
        # 旧形式（円: x, y, r）は楕円（w = h = 2r）として読み替える
        if shape == 'circle':
            radius = _number(item.get('r'), 5, 400)
            item = dict(item, shape='ellipse', w=radius * 2, h=radius * 2)
            shape = 'ellipse'
        if shape not in TABLE_SHAPES:
            raise ValidationError('机の形が不正です')

        table = {'id': table_id, 'shape': shape}
        if shape == 'polygon':
            table['points'] = _clean_points(item.get('points'))
        else:
            table['x'] = _number(item.get('x'), 0, CANVAS_WIDTH)
            table['y'] = _number(item.get('y'), 0, CANVAS_HEIGHT)
            table['w'] = _number(item.get('w'), MIN_TABLE_SIZE, MAX_TABLE_SIZE)
            table['h'] = _number(item.get('h'), MIN_TABLE_SIZE, MAX_TABLE_SIZE)
        tables.append(table)
    return tables


def _clean_seats(raw) -> List[Dict]:
    if not isinstance(raw, list) or len(raw) > MAX_SEATS:
        raise ValidationError('座席の数が不正です')

    seats, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError('座席のデータが不正です')
        seat_id = _integer(item.get('id'), 1, 1_000_000)
        if seat_id in seen:
            raise ValidationError('座席のIDが重複しています')
        seen.add(seat_id)
        seats.append({
            'id': seat_id,
            'x': _number(item.get('x'), 0, CANVAS_WIDTH),
            'y': _number(item.get('y'), 0, CANVAS_HEIGHT),
            'label': _integer(item.get('label'), 1, 9999),
        })
    return seats


def _clean_annotations(raw) -> List[Dict]:
    """会場図に書き込む文字・矢印・線を検証・整形する"""
    if not isinstance(raw, list) or len(raw) > MAX_ANNOTATIONS:
        raise ValidationError('書き込みの数が不正です')

    items, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError('書き込みのデータが不正です')
        item_id = _integer(item.get('id'), 1, 1_000_000)
        if item_id in seen:
            raise ValidationError('書き込みのIDが重複しています')
        seen.add(item_id)

        kind = item.get('type')
        if kind == 'text':
            text = item.get('text')
            if not isinstance(text, str) or not text.strip():
                raise ValidationError('文字を入力してください')
            text = text.strip()
            if len(text) > MAX_ANNOTATION_TEXT:
                raise ValidationError(f'文字は{MAX_ANNOTATION_TEXT}文字以内にしてください')
            items.append({
                'id': item_id,
                'type': 'text',
                'x': _number(item.get('x'), 0, CANVAS_WIDTH),
                'y': _number(item.get('y'), 0, CANVAS_HEIGHT),
                'text': text,
                'size': _integer(item.get('size', DEFAULT_TEXT_SIZE), MIN_TEXT_SIZE, MAX_TEXT_SIZE),
            })
        elif kind in ('arrow', 'line'):
            # 矢印（終点に矢じりあり）と線（矢じりなし）は同じ形式
            segment = {
                'id': item_id,
                'type': kind,
                'x1': _number(item.get('x1'), 0, CANVAS_WIDTH),
                'y1': _number(item.get('y1'), 0, CANVAS_HEIGHT),
                'x2': _number(item.get('x2'), 0, CANVAS_WIDTH),
                'y2': _number(item.get('y2'), 0, CANVAS_HEIGHT),
            }
            if math.hypot(segment['x2'] - segment['x1'], segment['y2'] - segment['y1']) < MIN_ARROW_LENGTH:
                raise ValidationError('矢印・線が短すぎます')
            items.append(segment)
        else:
            raise ValidationError('書き込みの種類が不正です')
    return items


def _clean_names(raw) -> List[str]:
    """名前の入力候補を検証・整形する（前後の空白除去、空行除去、重複除去）"""
    if not isinstance(raw, list) or len(raw) > MAX_PARTICIPANTS * 2:
        raise ValidationError('参加者リストの形式が不正です')
    names: List[str] = []
    for item in raw:
        if not isinstance(item, str):
            raise ValidationError('参加者リストの形式が不正です')
        name = item.strip()
        if not name:
            continue
        if len(name) > MAX_NAME_LENGTH:
            raise ValidationError(f'名前は{MAX_NAME_LENGTH}文字以内にしてください: {name[:10]}...')
        if name not in names:
            names.append(name)
    if len(names) > MAX_PARTICIPANTS:
        raise ValidationError(f'参加者は{MAX_PARTICIPANTS}名までです')
    return names


class SeatStore:
    """レイアウトと着席状況のスレッドセーフなストア"""

    def __init__(self, path: str):
        self.path = path
        # 乱数取得（量子ジョブ）を含む操作を直列化するためのロック
        self.lock = threading.RLock()
        self._state = self._load()

    # ---- 永続化 ----

    @staticmethod
    def _empty_state() -> Dict:
        return {'tables': [], 'seats': [], 'annotations': [], 'assignments': [], 'participants': []}

    def _load(self) -> Dict:
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return {
                'tables': _clean_tables(data.get('tables', [])),
                'seats': _clean_seats(data.get('seats', [])),
                'annotations': _clean_annotations(data.get('annotations', [])),
                'assignments': list(data.get('assignments', [])),
                'participants': _clean_names(data.get('participants', [])),
            }
        except FileNotFoundError:
            return self._empty_state()
        except (OSError, ValueError, ValidationError, AttributeError):
            logger.error('状態ファイルの読み込みに失敗しました。空の状態で開始します', exc_info=True)
            return self._empty_state()

    def _save(self):
        directory = os.path.dirname(self.path) or '.'
        os.makedirs(directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=directory, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(self._state, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)
        except BaseException:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

    # ---- 参照 ----

    def snapshot(self) -> Dict:
        with self.lock:
            return copy.deepcopy(self._state)

    # ---- レイアウト ----

    def set_layout(self, tables, seats, annotations=None) -> Dict:
        """
        机・座席・書き込み（文字と矢印）のレイアウトを更新する。着席中の座席は削除できない

        annotations が None のときは、保存済みの書き込みをそのまま残す。
        """
        clean_tables = _clean_tables(tables)
        clean_seats = _clean_seats(seats)
        clean_annotations = None if annotations is None else _clean_annotations(annotations)
        seat_ids = {s['id'] for s in clean_seats}

        with self.lock:
            for a in self._state['assignments']:
                if a['seat_id'] not in seat_ids:
                    raise ValidationError('着席中の座席は削除できません')
            self._state['tables'] = clean_tables
            self._state['seats'] = clean_seats
            if clean_annotations is not None:
                self._state['annotations'] = clean_annotations
            self._save()
            return self.snapshot()

    # ---- 名前の入力候補 ----

    def set_participants(self, names) -> Dict:
        """名前の入力候補を上書きする（着席状況には影響しない）"""
        clean = _clean_names(names)
        with self.lock:
            self._state['participants'] = clean
            self._save()
            return self.snapshot()

    # ---- 受付 ----

    def check_in(self, name, choose: ChooseFunc) -> Dict:
        """1名を受付し、空席からランダムに席を割り当てる"""
        if not isinstance(name, str):
            raise ValidationError('名前を入力してください')
        name = name.strip()
        if not name:
            raise ValidationError('名前を入力してください')
        if len(name) > MAX_NAME_LENGTH:
            raise ValidationError(f'名前は{MAX_NAME_LENGTH}文字以内で入力してください')

        with self.lock:
            if not self._state['seats']:
                raise ValidationError('座席が配置されていません')
            if any(a['name'] == name for a in self._state['assignments']):
                raise ValidationError('同じ名前の方がすでに着席しています')

            taken = {a['seat_id'] for a in self._state['assignments']}
            free = [s for s in self._state['seats'] if s['id'] not in taken]
            if not free:
                raise ValidationError('空席がありません')

            index = choose(len(free))
            if not 0 <= index < len(free):
                raise RuntimeError('乱数が範囲外です')
            seat = free[index]

            entry = {
                'name': name,
                'seat_id': seat['id'],
                'seated_at': datetime.now().isoformat(timespec='seconds'),
            }
            self._state['assignments'].append(entry)
            self._save()
            return {'assignment': entry, 'seat': seat, 'state': self.snapshot()}

    def check_in_all(self, choose: ChooseFunc) -> Dict:
        """
        参加者リストのうちまだ着席していない全員を、空席からまとめて割り当てる

        空席が足りないとき・対象者がいないときは、何も変更せずエラーにする。
        """
        with self.lock:
            seated = {a['name'] for a in self._state['assignments']}
            names = [n for n in self._state['participants'] if n not in seated]
            if not names:
                raise ValidationError('未着席の参加者がいません。参加者リストに名前を入力してください')

            taken = {a['seat_id'] for a in self._state['assignments']}
            free = [s for s in self._state['seats'] if s['id'] not in taken]
            if len(names) > len(free):
                raise ValidationError(
                    f'空席が足りません（未着席 {len(names)} 名 / 空席 {len(free)} 席）')

            seated_at = datetime.now().isoformat(timespec='seconds')
            entries = []
            for name in names:
                index = choose(len(free))
                if not 0 <= index < len(free):
                    raise RuntimeError('乱数が範囲外です')
                seat = free.pop(index)
                entries.append({'name': name, 'seat_id': seat['id'], 'seated_at': seated_at})

            # 全員分の抽選が成功してから反映する（途中失敗時は元の状態を保つ）
            self._state['assignments'].extend(entries)
            self._save()
            return {'assignments': entries, 'state': self.snapshot()}

    def check_out(self, seat_id) -> Dict:
        """指定した席の着席を取り消す"""
        with self.lock:
            before = len(self._state['assignments'])
            self._state['assignments'] = [
                a for a in self._state['assignments'] if a['seat_id'] != seat_id]
            if len(self._state['assignments']) == before:
                raise ValidationError('その席に着席している方がいません')
            self._save()
            return self.snapshot()

    def reset_assignments(self) -> Dict:
        """着席状況を全てリセットする（レイアウトは残す）"""
        with self.lock:
            self._state['assignments'] = []
            self._save()
            return self.snapshot()

    def reshuffle(self, choose: ChooseFunc) -> Dict:
        """着席済みの全員を、全座席（空席含む）から改めて抽選し直す"""
        with self.lock:
            if not self._state['assignments']:
                raise ValidationError('着席している方がいません')

            remaining = [s['id'] for s in self._state['seats']]
            new_seats = []
            for _ in self._state['assignments']:
                index = choose(len(remaining))
                if not 0 <= index < len(remaining):
                    raise RuntimeError('乱数が範囲外です')
                new_seats.append(remaining.pop(index))

            # 全員分の抽選が成功してから反映する（途中失敗時は元の状態を保つ）
            for a, seat_id in zip(self._state['assignments'], new_seats):
                a['seat_id'] = seat_id
            self._save()
            return self.snapshot()
