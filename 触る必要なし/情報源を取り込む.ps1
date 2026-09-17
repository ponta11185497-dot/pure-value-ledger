$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$dropFile = Join-Path $root "新しい情報源.txt"
$sourcesFile = Join-Path $root "sources.json"

$headerTemplate = @"
# ここに情報源のURLまたは@Xアカウントを1行に1つずつ書いてください。
# 例:
# https://example.com/lottery
# @example_account
#
# 書き終わったら「情報源を取り込む.bat」をダブルクリックしてください。
# 自動でsources.jsonに追加され、GitHubに送信されます。
# 取り込みが終わると、このファイルは自動で空(この説明だけの状態)に戻ります。
"@

function Write-Utf8NoBom($path, $text) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $text, $enc)
}

function ConvertTo-JsonStringLiteral($s) {
    if ($null -eq $s) { return '""' }
    $escaped = $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
    return '"' + $escaped + '"'
}

# sources.jsonをアプリ(index.html)のエクスポート形式(2スペースインデント)と
# 完全に同じ書式で出力するための自前フォーマッタ。ConvertTo-Jsonは
# インデント幅やキーの後のスペース数を変えてしまい、差分が無駄に大きくなるため使わない。
function Format-SourcesJson($items) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("[")
    for ($idx = 0; $idx -lt $items.Count; $idx++) {
        $it = $items[$idx]
        $comma = if ($idx -lt $items.Count - 1) { "," } else { "" }
        $lines.Add("  {")
        $lines.Add("    " + '"id": ' + (ConvertTo-JsonStringLiteral $it.id) + ",")
        $lines.Add("    " + '"type": ' + (ConvertTo-JsonStringLiteral $it.type) + ",")
        $lines.Add("    " + '"value": ' + (ConvertTo-JsonStringLiteral $it.value) + ",")
        $lines.Add("    " + '"note": ' + (ConvertTo-JsonStringLiteral $it.note) + ",")
        $lines.Add("    " + '"addedAt": ' + (ConvertTo-JsonStringLiteral $it.addedAt))
        $lines.Add("  }" + $comma)
    }
    $lines.Add("]")
    return ($lines -join "`n")
}

if (-not (Test-Path $dropFile)) {
    Write-Host "新しい情報源.txt が見つかりません。作り直します。"
    Write-Utf8NoBom $dropFile $headerTemplate
    Write-Host "何も取り込まずに終了します。もう一度URLを書いてから実行してください。"
    exit
}

$lines = Get-Content $dropFile -Encoding UTF8 |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }

if ($lines.Count -eq 0) {
    Write-Host "取り込む情報源がありません(新しい情報源.txtにURLが書かれていません)。"
    exit
}

if (-not (Test-Path $sourcesFile)) {
    Write-Utf8NoBom $sourcesFile "[]"
}

$existing = Get-Content $sourcesFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $existing) { $existing = @() }
$existingValues = @($existing | ForEach-Object { $_.value })

$today = Get-Date -Format "yyyy-MM-dd"
$epochBase = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$added = @()
$skipped = @()
$i = 0

foreach ($line in $lines) {
    if ($existingValues -contains $line) {
        $skipped += $line
        continue
    }
    $type = if ($line.StartsWith("@")) { "x" } else { "url" }
    $rand = -join ((48..57) + (97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
    $id = "s-$($epochBase + $i)-$rand"
    $entry = [ordered]@{
        id      = $id
        type    = $type
        value   = $line
        note    = ""
        addedAt = $today
    }
    $added += (New-Object PSObject -Property $entry)
    $existingValues += $line
    $i++
}

if ($added.Count -eq 0) {
    Write-Host "書かれていたURLは全て登録済みでした。新規追加はありません。"
    Write-Utf8NoBom $dropFile $headerTemplate
    exit
}

$combined = @($existing) + $added
$json = Format-SourcesJson $combined
Write-Utf8NoBom $sourcesFile $json

Write-Utf8NoBom $dropFile $headerTemplate

Write-Host "$($added.Count)件の情報源を追加しました。"
if ($skipped.Count -gt 0) {
    Write-Host "(登録済みのためスキップ: $($skipped.Count)件)"
}

Write-Host ""
Write-Host "GitHubへ送信しています..."
git add sources.json | Out-Null
git commit -m "情報源を追加 ($($added.Count)件) - 自動取り込み"
if ($LASTEXITCODE -ne 0) {
    Write-Host "コミットに失敗しました。sources.jsonはローカルには保存済みなので、あとでもう一度実行してください。"
    exit
}
git push
if ($LASTEXITCODE -eq 0) {
    Write-Host "GitHubへの送信が完了しました。"
} else {
    Write-Host "GitHubへの送信に失敗しました。ネットワーク状況を確認して、もう一度このファイルを実行してください。"
}
