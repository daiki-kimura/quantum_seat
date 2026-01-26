# 🎲 Quantum Seat - 量子乱数で席替え

IBM Quantumマシンを活用して生成した真の量子乱数を使用した、飲み会などの席替えアプリケーションです。

## ✨ 特徴

- **真の量子乱数**: IBM Quantumの実機またはシミュレーターで生成した量子乱数を使用
- **直感的なGUI**: ドラッグ&ドロップで自由に座席を配置
- **机の描画**: Shiftキーを押しながらドラッグで机（テーブル）を描画可能
- **プリセット機能**: テーブル形式や円形配置などの自動配置
- **視覚的な結果表示**: 座席配置図と一覧表で結果を確認
- **エクスポート機能**: 結果をCSVファイルでエクスポート
- **参加者リスト**: `participants.txt`ファイルから参加者名を自動読み込み

## 🚀 セットアップ

### 1. 必要な環境

- Python 3.8以上
- IBM Quantum Experience アカウント（推奨）

### 2. IBM Quantum APIトークンの取得

1. [IBM Quantum Experience](https://quantum.ibm.com/) にアクセス
2. アカウントを作成またはログイン
3. 右上のアカウントアイコンから「Account settings」を選択
4. 「API token」セクションでトークンをコピー

### 3. インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd quantum_seat

# 仮想環境を作成（推奨）
python -m venv venv

# 仮想環境を有効化
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 依存パッケージをインストール
pip install -r requirements.txt
```

### 4. 環境変数の設定

```bash
# .envファイルを作成
cp .env.example .env

# .envファイルを編集してIBM Quantum APIトークンを設定
# IBM_QUANTUM_TOKEN=your_actual_token_here
```

### 5. アプリケーションの起動

```bash
python app.py
```

ブラウザで `http://localhost:5000` にアクセスしてください。

## 📖 使い方

### ステップ1: 参加者を入力

**方法1: 手動入力**

1. 参加者数を設定（デフォルト: 19名、最大100名）
2. 「入力欄を生成」ボタンをクリック
3. 各参加者の名前を入力

**方法2: ファイルから読み込み**

1. `participants.txt.example`を`participants.txt`にコピー
   ```bash
   cp participants.txt.example participants.txt
   ```
2. `participants.txt`を編集して、1行に1名ずつ参加者名を記入
3. アプリケーション起動時に自動的に読み込まれます

**注意**: `participants.txt`は個人情報を含む可能性があるため、`.gitignore`に追加されており、Gitリポジトリにはアップロードされません。

### ステップ2: 座席を配置

以下の方法で座席を配置できます：

- **手動追加**: 「座席を追加」ボタンで座席を追加
- **ドラッグ**: 座席をドラッグして位置を変更
- **削除**: 座席をダブルクリックで削除
- **机の描画**: **Shiftキーを押しながらドラッグ**で机（四角形）を描画
- **プリセット**: 「テーブル配置」または「円形配置」ボタンで自動配置

### ステップ3: 席替えを実行

1. 「量子乱数で席替え実行」ボタンをクリック
2. IBM Quantumで量子回路が実行され、真の乱数が生成されます
3. Fisher-Yatesアルゴリズムで参加者がシャッフルされます
4. 結果が表示されます

**⏱️ 実行時間について**

- 18名の参加者の場合、約1分30秒かかります
- 実行時間は参加者数に比例します（n名の場合、n-1回のIBM Quantumコールが必要）
- IBM Quantumに接続できない場合は、自動的にローカルシミュレーターにフォールバックします

### 結果の確認

- **座席配置図**: 視覚的に座席と参加者の配置を確認
- **割り当て一覧**: テーブル形式で座席番号と参加者名を確認
- **エクスポート**: 「結果をエクスポート」ボタンでCSVファイルをダウンロード

## 🔧 技術スタック

### バックエンド

- **Flask**: Webフレームワーク
- **Qiskit**: IBM Quantum SDK
- **qiskit-ibm-runtime**: IBM Quantum Runtime

### フロントエンド

- **HTML5/CSS3**: マークアップとスタイリング
- **JavaScript**: インタラクティブな機能
- **Canvas API**: 座席配置の描画

## 🧪 量子乱数生成の仕組み

このアプリケーションは、IBM Quantumの実機またはシミュレーターを使用して真の量子乱数を生成します。

### 量子回路の構築と実行

1. **量子回路の構築**
   - 必要なビット数の量子ビットを用意
   - アダマールゲート（H）で各量子ビットを重ね合わせ状態に変換
   - 測定ゲートで古典ビットに結果を記録

2. **IBM Quantumでの実行**
   - `SamplerV2`（Primitives V2）を使用してジョブを実行
   - 指定されたバックエンド（例: `ibm_marrakesh`）または自動選択
   - 複数回測定（shots）して統計的に信頼性の高い乱数を生成

3. **Fisher-Yatesシャッフルアルゴリズム**
   - 各ステップで正確な範囲[0, i]の量子乱数を生成
   - モジュロ演算を使用しないため、バイアスのない完全なランダム性を実現
   - n名の参加者に対して、n-1回のIBM Quantumコールを実行

4. **座席割り当て**
   - シャッフルされた参加者リストを座席に順番に割り当て
   - 視覚的な座席配置図と一覧表で結果を表示

### 自動フォールバック機能

IBM Quantumに接続できない場合、自動的にローカルの`AerSimulator`にフォールバックします。この場合も量子シミュレーションによる高品質な乱数が生成されます。

## 🔐 セキュリティ

- IBM Quantum APIトークンは環境変数で管理
- `.gitignore`で機密情報を除外
- セッション管理でユーザーデータを保護

## 🐛 トラブルシューティング

詳細なトラブルシューティングガイドは [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照してください。

### よくある問題

#### ポート5000が使用中

アプリケーションはデフォルトでポート5001を使用します：

```bash
python app.py
# ブラウザで http://localhost:5001 にアクセス
```

macOSでポート5000がAirPlayで使用されている場合は、システム設定でAirPlay Receiverを無効化するか、別のポートを使用してください。

#### urllib3のOpenSSL警告

この警告は機能に影響しません。解決するには：

```bash
pip install 'urllib3<2.0.0'
```

### IBM Quantumに接続できない

**症状**: 「トークン未設定」と表示される

**解決方法**:

1. `.env`ファイルが存在するか確認
2. `IBM_QUANTUM_TOKEN`が正しく設定されているか確認
3. トークンが有効か確認（IBM Quantum Experienceで再生成）

### 疑似乱数が使用される

**症状**: 「疑似乱数を使用」と表示される

**原因**: IBM Quantumバックエンドに接続できない場合、自動的に疑似乱数にフォールバックします

**解決方法**:

1. インターネット接続を確認
2. IBM Quantum APIトークンを確認
3. IBM Quantumサービスのステータスを確認

### パッケージのインストールエラー

**症状**: `pip install`でエラーが発生

**解決方法**:

```bash
# pipをアップグレード
pip install --upgrade pip

# 個別にインストール
pip install qiskit
pip install qiskit-ibm-runtime
pip install flask
```

## 📝 設定のカスタマイズ

### config.py

以下の設定を変更できます：

- `DEFAULT_PARTICIPANTS`: デフォルトの参加者数（デフォルト: 19）
- `MAX_PARTICIPANTS`: 最大参加者数（デフォルト: 100）
- `QUANTUM_SHOTS`: 量子回路の測定回数（デフォルト: 1024）
- `MAX_QUBITS`: 使用する最大量子ビット数（デフォルト: 10）

### .env

環境変数で以下を設定できます：

- `IBM_QUANTUM_TOKEN`: IBM Quantum APIトークン（必須）
- `IBM_QUANTUM_INSTANCE`: IBM Cloud CRN（オプション）
- `IBM_QUANTUM_BACKEND`: 使用するバックエンド名（例: `ibm_marrakish`、オプション）

**バックエンドの指定例**:

```bash
IBM_QUANTUM_BACKEND=ibm_marrakesh
```

指定しない場合は、利用可能なバックエンドから自動的に選択されます。

## ⚡ パフォーマンスについて

### 実行時間

IBM Quantumの実機を使用する場合、参加者数に応じて以下の実行時間がかかります：

| 参加者数 | IBM Quantumコール回数 | 概算実行時間 |
| -------- | --------------------- | ------------ |
| 3名      | 2回                   | 約10秒       |
| 10名     | 9回                   | 約45秒       |
| 18名     | 17回                  | 約1分30秒    |
| 50名     | 49回                  | 約4分        |

**実測例**:

- 18名の参加者で席替えを実行した場合、約1分30秒かかりました

**注意事項**:

- 実行時間はネットワーク状況やIBM Quantumの混雑状況により変動します
- ローカルシミュレーター（AerSimulator）を使用する場合は、数秒で完了します
- 大人数の席替えを頻繁に行う場合は、ローカルシミュレーターの使用を推奨します

### 最適化のヒント

- **少人数の場合**: IBM Quantumの実機で真の量子乱数を体験
- **大人数の場合**: ローカルシミュレーターで高速実行
- **バックエンド選択**: `.env`ファイルで特定のバックエンドを指定可能

## 🤝 貢献

プルリクエストを歓迎します！大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📄 ライセンス

このプロジェクトは教育・エンターテイメント目的で作成されています。

## 🙏 謝辞

- [IBM Quantum](https://quantum.ibm.com/) - 量子コンピューティングプラットフォーム
- [Qiskit](https://qiskit.org/) - オープンソース量子コンピューティングSDK
- [IBM Bob](https://www.ibm.com/products/bob) - このプロジェクトの開発支援とコードレビュー

## 📚 参考資料

- [Qiskit Documentation](https://qiskit.org/documentation/)
- [IBM Quantum Experience](https://quantum.ibm.com/)
- [量子コンピューティング入門](https://qiskit.org/textbook/ja/preface.html)

## 🔮 今後の機能追加予定

- [ ] 参加者のグループ分け機能
- [ ] 席替え履歴の保存
- [ ] 複数回の席替えシミュレーション
- [ ] PDF形式でのエクスポート
- [ ] 制約条件の設定（特定の人を隣にしない等）
- [ ] バッチ処理による高速化（複数の乱数を一度に生成）

## 📞 サポート

問題が発生した場合は、GitHubのissueを作成してください。
