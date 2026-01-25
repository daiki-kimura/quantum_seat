# 📊 Quantum Seat プロジェクト概要

## プロジェクト情報

**プロジェクト名**: Quantum Seat  
**バージョン**: 1.0.0  
**作成日**: 2026年1月  
**目的**: IBM Quantumを使用した席替えアプリケーション

## 📁 プロジェクト構造

```
quantum_seat/
├── app.py                      # Flaskメインアプリケーション
├── config.py                   # アプリケーション設定
├── requirements.txt            # Python依存パッケージ
├── .env.example               # 環境変数テンプレート
├── .gitignore                 # Git除外設定
├── README.md                  # プロジェクト説明書
├── QUICKSTART.md              # クイックスタートガイド
├── PROJECT_SUMMARY.md         # このファイル
├── setup.sh                   # セットアップスクリプト (macOS/Linux)
├── setup.bat                  # セットアップスクリプト (Windows)
│
├── quantum/                   # 量子乱数生成モジュール
│   ├── __init__.py
│   └── random_generator.py    # IBM Quantum統合
│
├── static/                    # 静的ファイル
│   ├── css/
│   │   └── style.css         # スタイルシート
│   └── js/
│       └── seat_layout.js    # 座席配置GUI
│
└── templates/                 # HTMLテンプレート
    ├── index.html            # メイン画面
    ├── 404.html              # 404エラーページ
    └── 500.html              # 500エラーページ
```

## 🎯 実装された機能

### コア機能

- ✅ IBM Quantum乱数生成
- ✅ 量子シミュレーター統合
- ✅ 自動フォールバック機能
- ✅ Fisher-Yatesシャッフルアルゴリズム

### UI/UX機能

- ✅ 参加者入力フォーム（可変人数）
- ✅ Canvas座席配置GUI
- ✅ ドラッグ&ドロップ機能
- ✅ 座席プリセット（テーブル/円形）
- ✅ 視覚的な結果表示
- ✅ CSVエクスポート機能

### バックエンド機能

- ✅ RESTful API設計
- ✅ セッション管理
- ✅ エラーハンドリング
- ✅ ロギング機能

## 🔧 技術スタック

### バックエンド

- **Python 3.8+**
- **Flask 3.0.0** - Webフレームワーク
- **Qiskit 1.0.0** - IBM Quantum SDK
- **qiskit-ibm-runtime 0.18.0** - IBM Quantum Runtime

### フロントエンド

- **HTML5/CSS3** - マークアップとスタイリング
- **JavaScript (Vanilla)** - インタラクティブ機能
- **Canvas API** - 座席配置の描画

### その他

- **python-dotenv** - 環境変数管理
- **numpy** - 数値計算

## 🚀 セットアップ方法

### 簡単セットアップ（推奨）

**macOS/Linux:**

```bash
./setup.sh
```

**Windows:**

```cmd
setup.bat
```

### 手動セットアップ

```bash
# 1. 仮想環境作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. パッケージインストール
pip install -r requirements.txt

# 3. 環境変数設定
cp .env.example .env
# .envファイルを編集

# 4. アプリケーション起動
python app.py
```

## 📖 使用方法

詳細は以下のドキュメントを参照：

- [README.md](README.md) - 完全なドキュメント
- [QUICKSTART.md](QUICKSTART.md) - クイックスタートガイド

## 🔬 量子乱数生成の仕組み

### アルゴリズム

1. **量子回路構築**

   ```
   量子ビット数 = ceil(log2(必要な乱数の範囲))
   各量子ビットにアダマールゲートを適用
   ```

2. **測定と乱数生成**

   ```
   量子状態を測定 → 0/1のビット列
   ビット列を整数に変換 → 乱数
   ```

3. **シャッフル**
   ```
   Fisher-Yatesアルゴリズム + 量子乱数
   参加者リストをランダムに並び替え
   ```

### バックエンド優先順位

1. `ibm_qasm_simulator` (IBM Quantum)
2. `aer_simulator` (ローカル)
3. `qasm_simulator` (ローカル)
4. 疑似乱数（フォールバック）

## 🎨 UI/UXデザイン

### カラースキーム

- **プライマリ**: #667eea (紫青)
- **セカンダリ**: #764ba2 (紫)
- **アクセント**: #2196f3 (青)
- **エラー**: #dc3545 (赤)

### レスポンシブデザイン

- デスクトップ: 1200px+
- タブレット: 768px - 1199px
- モバイル: ~767px

## 🔐 セキュリティ考慮事項

- ✅ 環境変数でAPIトークン管理
- ✅ .gitignoreで機密情報除外
- ✅ セッション管理
- ✅ 入力検証
- ✅ エラーハンドリング

## 📊 API エンドポイント

### GET /

メイン画面を表示

### POST /api/generate-random

量子乱数を生成

**Request:**

```json
{
  "count": 10,
  "max_value": 100
}
```

**Response:**

```json
{
  "success": true,
  "random_numbers": [3, 7, 1, ...],
  "method": "quantum",
  "backend": "ibm_qasm_simulator"
}
```

### POST /api/shuffle-seats

席替えを実行

**Request:**

```json
{
  "participants": ["参加者1", "参加者2", ...],
  "seats": [{"id": 1, "x": 100, "y": 100, "label": "1"}, ...]
}
```

**Response:**

```json
{
  "success": true,
  "assignments": [
    {"participant": "参加者1", "seat": {...}},
    ...
  ],
  "method": "quantum",
  "timestamp": "2026-01-25T14:00:00"
}
```

### GET /api/backend-info

バックエンド情報を取得

### GET /api/get-last-assignment

最後の席割り当て結果を取得

## 🧪 テスト

### 動作確認チェックリスト

- [ ] アプリケーション起動
- [ ] ページ表示
- [ ] 参加者入力
- [ ] 座席追加
- [ ] 座席ドラッグ
- [ ] プリセット配置
- [ ] 席替え実行
- [ ] 結果表示
- [ ] CSVエクスポート

### テストシナリオ

1. **基本フロー**
   - 18名の参加者を入力
   - テーブル配置を選択
   - 席替え実行
   - 結果確認

2. **カスタム配置**
   - 手動で座席を配置
   - ドラッグで位置調整
   - 席替え実行

3. **エラーハンドリング**
   - 座席数 < 参加者数
   - 空の参加者リスト
   - ネットワークエラー

## 🐛 既知の問題

現在、既知の問題はありません。

## 🔮 今後の拡張予定

- [ ] 参加者グループ分け機能
- [ ] 席替え履歴保存
- [ ] PDF/画像エクスポート
- [ ] 制約条件設定
- [ ] 多言語対応
- [ ] ダークモード
- [ ] モバイルアプリ版

## 📝 変更履歴

### v1.0.0 (2026-01-25)

- 初回リリース
- IBM Quantum統合
- 座席配置GUI実装
- 基本機能完成

## 👥 貢献者

このプロジェクトは教育・エンターテイメント目的で作成されました。

## 📄 ライセンス

教育・エンターテイメント目的での使用を想定しています。

## 🙏 謝辞

- IBM Quantum Team
- Qiskit Community
- Flask Community

## 📞 サポート

問題や質問がある場合は、GitHubのissueを作成してください。

---

**最終更新**: 2026年1月25日
