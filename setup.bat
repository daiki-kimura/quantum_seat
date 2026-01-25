@echo off
chcp 65001 > nul
echo 🎲 Quantum Seat セットアップを開始します...
echo.

REM Python バージョンチェック
echo 📋 Python バージョンを確認中...
python --version
echo.

REM 仮想環境の作成
echo 🔧 仮想環境を作成中...
if exist venv (
    echo    既存の仮想環境が見つかりました
    set /p REPLY="   削除して再作成しますか？ (y/N): "
    if /i "%REPLY%"=="y" (
        rmdir /s /q venv
        python -m venv venv
        echo    ✅ 仮想環境を再作成しました
    ) else (
        echo    既存の仮想環境を使用します
    )
) else (
    python -m venv venv
    echo    ✅ 仮想環境を作成しました
)
echo.

REM 仮想環境の有効化
echo 🔌 仮想環境を有効化中...
call venv\Scripts\activate.bat
echo    ✅ 仮想環境を有効化しました
echo.

REM 依存パッケージのインストール
echo 📦 依存パッケージをインストール中...
python -m pip install --upgrade pip > nul 2>&1
pip install -r requirements.txt
echo    ✅ パッケージのインストールが完了しました
echo.

REM .env ファイルの作成
echo ⚙️  環境変数を設定中...
if not exist .env (
    copy .env.example .env > nul
    echo    ✅ .env ファイルを作成しました
    echo.
    echo    📝 IBM Quantum APIトークンを設定してください：
    echo       1. https://quantum.ibm.com/ にアクセス
    echo       2. アカウント設定からAPIトークンを取得
    echo       3. .env ファイルの IBM_QUANTUM_TOKEN を編集
    echo.
    set /p REPLY="   今すぐトークンを設定しますか？ (y/N): "
    if /i "%REPLY%"=="y" (
        set /p TOKEN="   IBM Quantum APIトークンを入力: "
        if not "!TOKEN!"=="" (
            powershell -Command "(gc .env) -replace 'your_ibm_quantum_token_here', '!TOKEN!' | Out-File -encoding ASCII .env"
            echo    ✅ トークンを設定しました
        )
    ) else (
        echo    ⚠️  後で .env ファイルを編集してトークンを設定してください
    )
) else (
    echo    .env ファイルは既に存在します
)
echo.

REM セットアップ完了
echo ✨ セットアップが完了しました！
echo.
echo 🚀 アプリケーションを起動するには：
echo    venv\Scripts\activate
echo    python app.py
echo.
echo 📖 詳細は QUICKSTART.md を参照してください
echo.

REM アプリケーションを起動するか確認
set /p REPLY="今すぐアプリケーションを起動しますか？ (y/N): "
if /i "%REPLY%"=="y" (
    echo.
    echo 🎲 Quantum Seat を起動中...
    echo    ブラウザで http://localhost:5000 を開いてください
    echo.
    python app.py
)

@REM Made with Bob
