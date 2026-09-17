# プレ値台帳 - 状態メモ

## 完了済み
- index.html / data.json / sources.json 一式、GitHub連携まで完了
- リポジトリ: https://github.com/ponta11185497-dot/pure-value-ledger
- デスクトップショートカット「プレ値台帳」で起動可能
- デザイン: 白背景・ゴシック体・青アクセント(メルカリ/ヤフオク風)
- 機能: マイ応募/ランキング(倍率順)/終了した応募(自動移動)/情報源管理、すべて動作確認済み
- index.htmlは起動時にGitHub上のdata.jsonを自動取得して表示(オフライン時は前回キャッシュ→初期データにフォールバック)
- **週次自動更新(GitHub Actions)が完全に動作するようになった**
  - `.github/workflows/weekly-update.yml` をpush済み、毎週月曜9:00(JST)に自動実行
  - GitHub Secrets `CLAUDE_CODE_OAUTH_TOKEN` 登録済み(OAuth方式、Pro/Maxプラン内で追加課金なし)
  - GitHub App「Claude」もリポジトリにインストール・承認済み
  - 手動テスト実行(`gh workflow run weekly-update.yml`)で実際にdata.jsonが更新され、
    pushされることを確認済み(2026-09-17時点、12件のアイテムで動作確認)
- **カテゴリ別ランキング機能を追加**(総合/トレカ/おもちゃ/スニーカー/アパレル/ウィスキー/その他)
  - data.json・index.html双方の各アイテムに`category`を付与、ランキング画面にタブUIを追加
  - 「総合」タブは倍率上位30件、カテゴリ選択時はそのカテゴリの全件を表示
  - 週次自動更新プロンプトにも分類基準を追加済み(新規アイテムにも自動でcategoryが付く)
- **情報源をブラウザを開かずに取り込める仕組みを追加**
  - `新しい情報源.txt`: ここにURLまたは@Xアカウントを1行ずつ書く(説明コメント付き)
  - `情報源を取り込む.bat`: ダブルクリックすると`新しい情報源.txt`の内容を`sources.json`に
    追加し、GitHubへ自動push。処理後`新しい情報源.txt`は説明文だけの状態に自動で戻る
  - 重複URLは自動でスキップ。手動でアプリ画面から追加する方法(エクスポート→私が反映)と併用可能

## 解決した問題(今後同種の設定をする際の参考)
1. `claude setup-token` はClaude Codeセッション経由(Bashツール、`!`プレフィックス実行とも)
   では動かない。本物のTTYが必要なので、ユーザーがClaude Codeを介さず直接開いた
   PowerShell/ターミナルで実行してもらう必要がある。
2. ワークフローには `permissions: id-token: write` が必要(OIDCトークン取得のため)。
3. リポジトリに GitHub App「Claude」(https://github.com/apps/claude)をインストールしないと
   `claude-code-action` は動かない(「Claude Code is not installed on this repository」エラー)。
4. プロンプトでサブエージェント/バックグラウンドタスク(Agent, ScheduleWakeupツール)を
   使わせると、「完了通知待ち」のまま実行が終わってしまい、結果が反映されない
   (CI実行には続きのターンが存在しないため)。`--disallowedTools Agent,ScheduleWakeup`
   で禁止し、プロンプトでも同期実行を明示する必要がある。
5. 同期実行に切り替えると必要ターン数が増えるため `--max-turns` に余裕を持たせる
   (30では不足、60に設定)。
6. `claude-code-action` が実行中にgitの認証情報を独自トークンへ書き換えるため、
   後続のpushステップで `git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@...`
   のように標準トークンへ明示的に戻す必要がある。
7. 前段のstepが失敗扱いになると後続stepがスキップされるため、pushステップには
   `if: always()` を付けておくと安全。

## 次にこのフォルダで作業を頼むときの言い方(例)
「プレ値フォルダのSTATUS.mdを見て、続きから進めて」
