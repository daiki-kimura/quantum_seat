# 🔧 トラブルシューティングガイド

このガイドでは、Quantum Seatアプリケーションで発生する可能性のある問題と解決方法を説明します。

## 🚨 よくある問題と解決方法

### 1. ポート5000が使用中

**エラーメッセージ:**

```
Address already in use
Port 5000 is in use by another program.
```

**原因:**

- macOSでは、AirPlay Receiverがデフォルトでポート5000を使用しています
- 他のアプリケーションがポート5000を使用している

**解決方法A: デフォルトポート5001を使用（推奨）**

アプリケーションはデフォルトでポート5001を使用するように設定されています：

```bash
python app.py
# ブラウザで http://localhost:5001 にアクセス
```

**解決方法B: 別のポートを指定**

環境変数でポートを変更：

```bash
# .envファイルを編集
FLASK_PORT=8080

# または、コマンドラインで指定
FLASK_PORT=8080 python app.py
```

**解決方法C: macOSでAirPlay Receiverを無効化**

1. システム設定を開く
2. 「一般」→「AirDropとHandoff」
3. 「AirPlay Receiver」をオフにする

### 2. urllib3のOpenSSL警告

**警告メッセージ:**

```
NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+,
currently the 'ssl' module is compiled with 'LibreSSL 2.8.3'
```

**原因:**

- macOSのLibreSSLとurllib3 v2の互換性問題

**解決方法A: urllib3をダウングレード（推奨）**

```bash
pip install 'urllib3<2.0.0'
```

または、requirements.txtを更新して再インストール：

```bash
pip install -r requirements.txt
```

**解決方法B: 警告を無視**

この警告は機能に影響しません。アプリケーションは正常に動作します。

### 3. IBM Quantumに接続できない

**症状:**

- 「トークン未設定」と表示される
- 「疑似乱数を使用」と表示される

**解決方法:**

**ステップ1: トークンを確認**

```bash
# .envファイルを確認
cat .env

# IBM_QUANTUM_TOKENが設定されているか確認
```

**ステップ2: トークンを取得**

1. https://quantum.ibm.com/ にアクセス
2. ログインまたはアカウント作成
3. 右上のアカウントアイコン → 「Account settings」
4. 「API token」をコピー
5. `.env`ファイルに貼り付け

```bash
IBM_QUANTUM_TOKEN=your_actual_token_here
```

**ステップ3: アプリケーションを再起動**

```bash
# Ctrl+Cで停止
# 再起動
python app.py
```

**注意:** トークンがなくてもローカルシミュレーターで動作します！

### 4. パッケージのインストールエラー

**エラー例:**

```
ERROR: Could not find a version that satisfies the requirement qiskit
```

**解決方法:**

**ステップ1: pipをアップグレード**

```bash
pip install --upgrade pip
```

**ステップ2: 個別にインストール**

```bash
pip install qiskit
pip install qiskit-ibm-runtime
pip install flask
pip install python-dotenv
```

**ステップ3: Python バージョンを確認**

```bash
python --version
# Python 3.8以上が必要
```

Python 3.8未満の場合は、Pythonをアップグレードしてください。

### 5. 仮想環境の問題

**症状:**

- パッケージがインストールされているのにインポートエラー
- 間違ったPythonバージョンが使用されている

**解決方法:**

**仮想環境を再作成:**

```bash
# 既存の仮想環境を削除
rm -rf venv

# 新しい仮想環境を作成
python3 -m venv venv

# 有効化
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# パッケージを再インストール
pip install -r requirements.txt
```

### 6. ブラウザでページが表示されない

**症状:**

- ブラウザで「接続できません」と表示される

**解決方法:**

**ステップ1: アプリケーションが起動しているか確認**

ターミナルに以下のようなメッセージが表示されているか確認：

```
* Running on http://0.0.0.0:5001
* Running on http://127.0.0.1:5001
```

**ステップ2: 正しいURLにアクセス**

```
http://localhost:5001
または
http://127.0.0.1:5001
```

**ステップ3: ファイアウォールを確認**

ファイアウォールがポートをブロックしていないか確認してください。

### 7. 座席が表示されない

**症状:**

- キャンバスが空白
- 座席を追加しても表示されない

**解決方法:**

**ステップ1: ブラウザのコンソールを確認**

1. F12キーを押す
2. 「Console」タブを確認
3. エラーメッセージがあれば報告

**ステップ2: ブラウザのキャッシュをクリア**

```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (macOS)
```

**ステップ3: 別のブラウザで試す**

Chrome、Firefox、Safariなどで試してください。

### 8. 席替えが実行できない

**症状:**

- 「量子乱数で席替え実行」ボタンをクリックしても反応しない

**解決方法:**

**ステップ1: 入力を確認**

- 参加者名が入力されているか
- 座席が配置されているか
- 座席数 ≥ 参加者数か

**ステップ2: ブラウザのコンソールを確認**

F12キーを押してエラーメッセージを確認

**ステップ3: サーバーログを確認**

ターミナルでエラーメッセージを確認

## 🆘 それでも解決しない場合

### デバッグモードで実行

```bash
# デバッグ情報を表示
FLASK_ENV=development python app.py
```

### ログを確認

アプリケーションのログを確認してエラーの詳細を把握：

```bash
# ターミナルの出力を確認
# エラーメッセージをコピー
```

### 問題を報告

以下の情報を含めてGitHubでissueを作成：

1. **エラーメッセージ**: 完全なエラーメッセージ
2. **環境情報**:
   - OS: macOS/Windows/Linux
   - Pythonバージョン: `python --version`
   - パッケージバージョン: `pip list`
3. **再現手順**: 問題が発生する手順
4. **期待される動作**: 本来どうなるべきか

## 📚 追加リソース

- [README.md](README.md) - 完全なドキュメント
- [QUICKSTART.md](QUICKSTART.md) - クイックスタート
- [Qiskit Documentation](https://qiskit.org/documentation/)
- [Flask Documentation](https://flask.palletsprojects.com/)

## 💡 ヒント

### パフォーマンスの最適化

1. **量子回路の実行回数を調整**
   - `config.py`の`QUANTUM_SHOTS`を変更

2. **ローカルシミュレーターを使用**
   - IBM Quantumトークンを設定しない
   - より高速に動作します

### セキュリティ

1. **本番環境では**
   - `FLASK_ENV=production`に設定
   - `DEBUG=False`に設定
   - 強力なシークレットキーを使用

2. **トークンの管理**
   - `.env`ファイルをGitにコミットしない
   - トークンを定期的に更新

## 🔄 完全リセット

すべてをリセットして最初からやり直す：

```bash
# 仮想環境を削除
rm -rf venv

# .envファイルを削除
rm .env

# セットアップスクリプトを実行
./setup.sh  # macOS/Linux
setup.bat   # Windows
```

---

**最終更新**: 2026年1月25日
