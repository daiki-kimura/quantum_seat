# 🚀 起動方法

## 最速スタート（3ステップ）

### 1. 依存パッケージをインストール

```bash
pip install -r requirements.txt
```

### 2. アプリケーションを起動

```bash
python app.py
```

### 3. ブラウザでアクセス

```
http://localhost:5001
```

## 📝 注意事項

### ポート番号について

- **デフォルトポート**: 5001
- macOSではポート5000がAirPlayで使用されているため、5001を使用しています

### 別のポートを使用する場合

```bash
# 環境変数で指定
FLASK_PORT=8080 python app.py

# または.envファイルに追加
echo "FLASK_PORT=8080" >> .env
```

### IBM Quantum APIトークン（オプション）

トークンがなくてもローカルシミュレーターで動作します。

真の量子乱数を使用したい場合：

1. https://quantum.ibm.com/ でトークンを取得
2. `.env`ファイルを作成
3. トークンを設定

```bash
cp .env.example .env
# .envファイルを編集してトークンを設定
```

## 🐛 問題が発生した場合

### ポート使用中エラー

```
Address already in use
```

→ 別のポートを使用してください（上記参照）

### urllib3警告

```
NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+
```

→ 警告は無視できます。または：

```bash
pip install 'urllib3<2.0.0'
```

### その他の問題

詳細は [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照してください。

## 📚 詳細情報

- [README.md](README.md) - 完全なドキュメント
- [QUICKSTART.md](QUICKSTART.md) - 詳細なセットアップガイド
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - トラブルシューティング

---

**すぐに始めたい方は、上記の3ステップだけで十分です！**
