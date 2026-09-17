# プレ値台帳 - 状態メモ

## 完了済み
- index.html / data.json / sources.json 一式、GitHub連携まで完了
- リポジトリ: https://github.com/ponta11185497-dot/pure-value-ledger
- デスクトップショートカット「プレ値台帳」で起動可能
- デザイン: 白背景・ゴシック体・青アクセント(メルカリ/ヤフオク風)
- 機能: マイ応募/ランキング(倍率順)/終了した応募(自動移動)/情報源管理、すべて動作確認済み
- index.htmlは起動時にGitHub上のdata.jsonを自動取得して表示(オフライン時は前回キャッシュ→初期データにフォールバック)

## 未完了(保留中)
- **週次自動更新(GitHub Actions)が未設定**
  - `.github/workflows/weekly-update.yml` はローカルに準備済みだが、まだリポジトリに
    push できていない(`.github/`, `STATUS.md`, `起動.bat` がuntrackedのまま)
  - GitHub Secrets(`CLAUDE_CODE_OAUTH_TOKEN`)は未登録(`gh secret list`で0件確認済み)
  - 課金を避けたいとの方針のため、API キー方式(`ANTHROPIC_API_KEY`)ではなく
    OAuth方式(`claude setup-token`、Pro/Maxプラン内で追加課金なし)で進める方針に決定
  - **原因を特定:** Claude Codeセッション経由のコマンド実行(Bashツール実行、および
    チャット欄からの`!`プレフィックス実行の両方)は本物のTTYではないため、
    `claude setup-token` のインタラクティブUI(ブラウザ認証完了の検知)が機能しない。
    ブラウザ側の認証自体は毎回成功するが、コマンド側の出力が0バイトのまま固まる。
  - **次回の進め方:** Claude Codeを介さず、Windowsのターミナル/PowerShellを
    ユーザーが直接(Claude Code外で)開いて `claude setup-token` を実行してもらう。
    発行されたトークンをチャットに貼ってもらい、`gh secret set CLAUDE_CODE_OAUTH_TOKEN`
    で登録する。

## 次にこのフォルダで作業を頼むときの言い方(例)
「プレ値フォルダのSTATUS.mdを見て、週次自動更新の設定を続きから進めて」
