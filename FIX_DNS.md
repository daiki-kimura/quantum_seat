# 🔧 DNS問題の解決方法（macOS）

## 🎯 目的

`global.quantum-computing.cloud.ibm.com` への接続を可能にする

## 📋 解決方法（優先順位順）

### 方法1: DNSキャッシュをクリア（最も簡単）

```bash
# DNSキャッシュをフラッシュ
sudo dscacheutil -flushcache

# mDNSResponderを再起動
sudo killall -HUP mDNSResponder

# 確認
echo "DNSキャッシュをクリアしました"
```

**実行後:**

```bash
# 接続テストを再実行
python test_connection.py
```

---

### 方法2: Google Public DNSを使用（推奨）

#### ステップ1: システム設定を開く

```
システム設定 → ネットワーク
```

#### ステップ2: 使用中のネットワークを選択

- Wi-Fiまたは有線接続を選択
- 「詳細...」ボタンをクリック

#### ステップ3: DNSタブを開く

- 「DNS」タブをクリック
- 左下の「+」ボタンをクリック

#### ステップ4: DNSサーバーを追加

以下のDNSサーバーを追加：

```
8.8.8.8
8.8.4.4
1.1.1.1
1.0.0.1
```

#### ステップ5: 適用

- 「OK」をクリック
- 「適用」をクリック

#### ステップ6: 確認

```bash
# DNSが変更されたか確認
scutil --dns | grep nameserver

# 接続テスト
nslookup global.quantum-computing.cloud.ibm.com
```

---

### 方法3: ネットワーク設定をリセット

#### ステップ1: Wi-Fiをオフ/オン

```
メニューバー → Wi-Fiアイコン → Wi-Fiをオフにする
（5秒待つ）
メニューバー → Wi-Fiアイコン → Wi-Fiをオンにする
```

#### ステップ2: ネットワーク設定を削除して再作成

```
システム設定 → ネットワーク
→ Wi-Fi を選択
→ 「-」ボタンで削除
→ 「+」ボタンで再追加
→ Wi-Fiネットワークに再接続
```

---

### 方法4: コマンドラインでDNSを一時的に変更

```bash
# 現在のDNS設定を確認
networksetup -getdnsservers Wi-Fi

# Google Public DNSに変更
sudo networksetup -setdnsservers Wi-Fi 8.8.8.8 8.8.4.4

# 確認
networksetup -getdnsservers Wi-Fi

# 接続テスト
nslookup global.quantum-computing.cloud.ibm.com
python test_connection.py
```

**元に戻す場合:**

```bash
# DHCPから自動取得に戻す
sudo networksetup -setdnsservers Wi-Fi "Empty"
```

---

### 方法5: /etc/hostsファイルを編集（最終手段）

**注意: この方法は一時的な回避策です**

```bash
# hostsファイルを編集
sudo nano /etc/hosts

# 以下の行を追加（IPアドレスは例です）
# 実際のIPアドレスは nslookup で確認してください
# 169.62.82.197 global.quantum-computing.cloud.ibm.com

# 保存: Ctrl+O → Enter → Ctrl+X

# 確認
ping global.quantum-computing.cloud.ibm.com
```

---

## 🔍 診断コマンド

### DNS解決をテスト

```bash
# 基本的なDNS解決
nslookup global.quantum-computing.cloud.ibm.com

# 特定のDNSサーバーを使用
nslookup global.quantum-computing.cloud.ibm.com 8.8.8.8

# 詳細情報
dig global.quantum-computing.cloud.ibm.com

# 現在のDNS設定を確認
scutil --dns
```

### ネットワーク接続をテスト

```bash
# 基本的な接続テスト
ping 8.8.8.8

# IBM Quantumホストへのping
ping global.quantum-computing.cloud.ibm.com

# HTTPSポートへの接続テスト
nc -zv global.quantum-computing.cloud.ibm.com 443

# curlでテスト
curl -v https://global.quantum-computing.cloud.ibm.com
```

---

## 📝 完全な解決手順（推奨）

### ステップ1: DNSキャッシュをクリア

```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

### ステップ2: Google Public DNSを設定

```
システム設定 → ネットワーク → Wi-Fi → 詳細 → DNS
追加: 8.8.8.8, 8.8.4.4
```

### ステップ3: ネットワークを再起動

```
Wi-Fiをオフ → 5秒待つ → Wi-Fiをオン
```

### ステップ4: 確認

```bash
# DNS解決テスト
nslookup global.quantum-computing.cloud.ibm.com

# 接続テスト
python test_connection.py
```

---

## 🆘 それでも解決しない場合

### オプション1: 別のネットワークを試す

```
- モバイルホットスポット
- 別のWi-Fiネットワーク
- 有線接続
```

### オプション2: VPNを使用

```
- VPNサービスに接続
- 別の地域のサーバーを試す
```

### オプション3: ローカルシミュレーターを使用（推奨）

```
アプリケーションは既に完璧に動作しています
IBM Quantum接続は必須ではありません
```

---

## ✅ 成功の確認

以下のコマンドが成功すればDNS問題は解決：

```bash
# 1. DNS解決
nslookup global.quantum-computing.cloud.ibm.com
# → IPアドレスが返ってくる

# 2. ping
ping -c 3 global.quantum-computing.cloud.ibm.com
# → 応答がある

# 3. 接続テスト
python test_connection.py
# → "✅ IBM Quantum Serviceに接続成功！"
```

---

## 💡 重要な注意事項

1. **DNS変更は即座に反映されない場合がある**
   - 変更後、1-2分待つ
   - ネットワークを再起動

2. **企業ネットワークの場合**
   - IT部門に確認が必要な場合がある
   - ファイアウォール設定の確認

3. **VPN使用時**
   - VPNを一時的に無効化して試す
   - VPNのDNS設定を確認

4. **アプリケーションは既に動作中**
   - DNS問題はオプション機能の問題
   - ローカルシミュレーターで完全動作

---

## 🎉 まとめ

**最も簡単で効果的な方法:**

1. DNSキャッシュをクリア
2. Google Public DNS (8.8.8.8) を設定
3. ネットワークを再起動
4. 接続テスト

**それでもダメなら:**

- ローカルシミュレーターで使用（推奨）
- アプリケーションは完全に動作中

**Quantum Seatアプリケーションは完成しており、IBM Quantum接続なしでも完璧に動作します！**
