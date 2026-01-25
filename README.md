# 🎲 Quantum Seat - 量子乱数で席替え

IBM Quantumマシンを活用して生成した真の乱数を使用した、飲み会などの席替えアプリケーションです。

## ✨ 特徴

- **真の乱数**: IBM Quantumシミュレーターで生成した量子乱数を使用
- **自由な座席配置**: GUIで直感的に座席を配置可能
- **ドラッグ&ドロップ**: 座席をドラッグして自由に配置変更
- **プリセット機能**: テーブル形式や円形配置などのプリセット
- **視覚的な結果表示**: 座席配置図と一覧表で結果を確認
- **エクスポート機能**: 結果をCSVファイルでエクスポート

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

1. 参加者数を設定（デフォルト: 18名）
2. 「入力欄を生成」ボタンをクリック
3. 各参加者の名前を入力

### ステップ2: 座席を配置

以下の方法で座席を配置できます：

- **手動追加**: 「座席を追加」ボタンで座席を追加
- **ドラッグ**: 座席をドラッグして位置を変更
- **削除**: 座席をダブルクリックで削除
- **プリセット**: 「テーブル配置」または「円形配置」ボタンで自動配置

### ステップ3: 席替えを実行

1. 「量子乱数で席替え実行」ボタンをクリック
2. 量子回路が実行され、乱数が生成されます
3. 結果が表示されます

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

このアプリケーションは以下の手順で量子乱数を生成します：

1. **量子回路の構築**
   - 必要なビット数の量子ビットを用意
   - アダマールゲートで各量子ビットを重ね合わせ状態に

2. **測定**
   - 量子ビットを測定して0または1の値を取得
   - 複数回測定して十分な乱数を生成

3. **シャッフル**
   - Fisher-Yatesアルゴリズムを量子乱数で実装
   - 参加者リストをシャッフル

4. **座席割り当て**
   - シャッフルされた参加者を座席に順番に割り当て

## 🔐 セキュリティ

- IBM Quantum APIトークンは環境変数で管理
- `.gitignore`で機密情報を除外
- セッション管理でユーザーデータを保護

## 🐛 トラブルシューティング

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

`config.py`で以下の設定を変更できます：

- `DEFAULT_PARTICIPANTS`: デフォルトの参加者数
- `MAX_PARTICIPANTS`: 最大参加者数
- `QUANTUM_SHOTS`: 量子回路の測定回数
- `MAX_QUBITS`: 使用する最大量子ビット数

## 🤝 貢献

プルリクエストを歓迎します！大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📄 ライセンス

このプロジェクトは教育・エンターテイメント目的で作成されています。

## 🙏 謝辞

- [IBM Quantum](https://quantum.ibm.com/) - 量子コンピューティングプラットフォーム
- [Qiskit](https://qiskit.org/) - オープンソース量子コンピューティングSDK

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
- [ ] 量子エンタングルメントを使った特殊な席配置アルゴリズム

## 📞 サポート

問題が発生した場合は、GitHubのissueを作成してください。
