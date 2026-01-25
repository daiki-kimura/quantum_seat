#!/bin/bash

# Quantum Seat セットアップスクリプト
# このスクリプトは自動的に環境をセットアップします

echo "🎲 Quantum Seat セットアップを開始します..."
echo ""

# Python バージョンチェック
echo "📋 Python バージョンを確認中..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "   Python $python_version が検出されました"
echo ""

# 仮想環境の作成
echo "🔧 仮想環境を作成中..."
if [ -d "venv" ]; then
    echo "   既存の仮想環境が見つかりました"
    read -p "   削除して再作成しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf venv
        python3 -m venv venv
        echo "   ✅ 仮想環境を再作成しました"
    else
        echo "   既存の仮想環境を使用します"
    fi
else
    python3 -m venv venv
    echo "   ✅ 仮想環境を作成しました"
fi
echo ""

# 仮想環境の有効化
echo "🔌 仮想環境を有効化中..."
source venv/bin/activate
echo "   ✅ 仮想環境を有効化しました"
echo ""

# 依存パッケージのインストール
echo "📦 依存パッケージをインストール中..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt
echo "   ✅ パッケージのインストールが完了しました"
echo ""

# .env ファイルの作成
echo "⚙️  環境変数を設定中..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "   ✅ .env ファイルを作成しました"
    echo ""
    echo "   📝 IBM Quantum APIトークンを設定してください："
    echo "      1. https://quantum.ibm.com/ にアクセス"
    echo "      2. アカウント設定からAPIトークンを取得"
    echo "      3. .env ファイルの IBM_QUANTUM_TOKEN を編集"
    echo ""
    read -p "   今すぐトークンを設定しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "   IBM Quantum APIトークンを入力: " token
        if [ ! -z "$token" ]; then
            sed -i.bak "s/your_ibm_quantum_token_here/$token/" .env
            rm .env.bak
            echo "   ✅ トークンを設定しました"
        fi
    else
        echo "   ⚠️  後で .env ファイルを編集してトークンを設定してください"
    fi
else
    echo "   .env ファイルは既に存在します"
fi
echo ""

# セットアップ完了
echo "✨ セットアップが完了しました！"
echo ""
echo "🚀 アプリケーションを起動するには："
echo "   source venv/bin/activate"
echo "   python app.py"
echo ""
echo "📖 詳細は QUICKSTART.md を参照してください"
echo ""

# アプリケーションを起動するか確認
read -p "今すぐアプリケーションを起動しますか？ (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🎲 Quantum Seat を起動中..."
    echo "   ブラウザで http://localhost:5000 を開いてください"
    echo ""
    python app.py
fi

# Made with Bob
