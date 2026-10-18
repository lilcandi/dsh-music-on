<#
  向 awesome-dsh-plugin 提交 lilcandi/dsh-music-on 的收录条目。

  为什么需要这个脚本，而不是直接 git push：
  - 本机 hosts 把 github.com / api.github.com 全部劫持到 127.0.0.1，
    必须用 --resolve 指定真实 IP，或让 git 走 127.0.0.1:7897 代理。
  - git push 到 fork 会被拒：PAT 只有 repo scope，没有 workflow scope，
    而「基于上游最新 main 建分支」必然带上它改过的 .github/workflows/*。
    所以分支内容用 GitHub Git Data API 直接建（tree -> commit -> ref），
    对方仓库里不产生任何 workflow 文件的改动，PAT 权限问题就绕开了。

  硬门槛（CI 按序检查，见上游 contributing.md）：
  1. 每个 PR 最多 3 条条目                     —— 本次 1 条
  2. 目标仓库 package.json 声明 dsh.bundle    —— 已满足
  3. 目标仓库创建满 1 天（自动检查）          —— 本脚本会先核这一项
  4. awesome-lint 与站点构建                  —— README 由维护者机器生成，不手工改

  用法：
    pwsh -File submit-marketplace.ps1            # 只体检，不提交
    pwsh -File submit-marketplace.ps1 -Submit    # 体检通过就真的开 PR
#>
[CmdletBinding()]
param(
  [switch]$Submit,
  # 上游与 fork 的固定坐标，改动一处即可整体迁移
  [string]$Upstream = 'awesome-dsh-plugin/awesome-dsh-plugin',
  [string]$Fork = 'lilcandi/awesome-dsh-plugin',
  [string]$Branch = 'add-dsh-music-on',
  [string]$EntryRel = 'data/plugins/lilcandi__dsh-music-on.yml',
  # 条目源文件：相对路径按本脚本所在的仓库根解析，换机器不用改
  [string]$EntrySrc = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/marketplace-entry.yml'),
  [string]$TargetRepo = 'lilcandi/dsh-music-on',
  [string]$ApiIp = '20.205.243.168',
  [string]$Title = 'data: add lilcandi/dsh-music-on'
)

$ErrorActionPreference = 'Stop'

# hosts 被劫持，curl 必须显式钉 IP；Invoke-RestMethod 走代理。
function Get-Pat {
  $cred = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
  $pass = ($cred | Select-String '^password=(.+)$').Matches.Groups[1].Value
  if (-not $pass) { throw '取不到 GitHub 凭据：git credential fill 没返回 password。' }
  return $pass
}

$pat = Get-Pat
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("lilcandi:$pat"))
$headers = @{
  Authorization          = "Basic $basic"
  'User-Agent'           = 'dsh-music-on-submit'
  Accept                 = 'application/vnd.github+json'
  'Content-Type'         = 'application/json'
}
$proxy = 'http://127.0.0.1:7897'

function Api([string]$Method, [string]$Path, $Body) {
  $uri = "https://api.github.com$Path"
  $args = @{ Method = $Method; Uri = $uri; Headers = $headers; Proxy = $proxy }
  if ($null -ne $Body) { $args.Body = ($Body | ConvertTo-Json -Depth 8 -Compress) }
  return Invoke-RestMethod @args
}

# 时间戳必须从**原始 JSON 字面值**取，不能读 ConvertFrom-Json 的结果。
# ConvertFrom-Json 会把 "2026-10-18T15:23:21Z" 转成 Kind=Local 的 DateTime，
# 再调 ToUniversalTime() 就会二次换算、整体偏移 8 小时：真实 3 小时算成 11 小时，
# 「还差 21 小时」算成「还差 13 小时」。踩过，写死这一条。
function Get-CreatedAt([string]$Repo) {
  $raw = curl.exe -s --resolve "api.github.com:443:$ApiIp" `
    -H "Authorization: Basic $basic" -H 'User-Agent: dsh-music-on-submit' `
    "https://api.github.com/repos/$Repo"
  $m = [regex]::Match($raw, '"created_at"\s*:\s*"([^"]+)"')
  if (-not $m.Success) { throw "读不到 $Repo 的 created_at" }
  return [datetimeoffset]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
}

# ---------- 1. 目标仓库满 1 天了吗 ----------
$repo = Api GET "/repos/$TargetRepo" $null
$created = Get-CreatedAt $TargetRepo
$over = $created.AddDays(1)
$now = [datetimeoffset]::UtcNow
$hours = [math]::Round(($now - $created).TotalHours, 2)
Write-Host ("仓库 {0}" -f $TargetRepo)
Write-Host ("  创建于     {0}  (北京时间 {1})" -f $created.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ'), $created.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd HH:mm:ss'))
Write-Host ("  已存活     {0} 小时" -f $hours)
if ($now -lt $over) {
  $left = [math]::Round(($over - $now).TotalHours, 2)
  Write-Host ("  ✗ 未满 1 天，还差 {0} 小时。CI 会自动拒。满 1 天时刻：{1}（北京时间 {2}）" -f `
    $left, $over.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ'), $over.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd HH:mm:ss')) -ForegroundColor Yellow
  $script:AgeGatePassed = $false
  if ($Submit) { throw '年龄门槛未过，已中止提交。' }
} else {
  Write-Host '  ✓ 已满 1 天，年龄门槛通过' -ForegroundColor Green
  $script:AgeGatePassed = $true
}

# ---------- 2. 条目文件自检 ----------
if (-not (Test-Path $EntrySrc)) { throw "找不到条目源文件：$EntrySrc" }
$entryText = Get-Content $EntrySrc -Raw
foreach ($needle in @('url: https://github.com/', 'name: ', 'category: ', 'description:')) {
  if (-not $entryText.Contains($needle)) { throw "条目缺少必需字段：$needle" }
}
if ($entryText -notmatch "url: https://github\.com/$TargetRepo") { throw '条目的 url 与目标仓库不一致。' }
# 描述含 ": " 必须加引号，否则 YAML 会把它解析成嵌套映射（上游最常见的坏法）
foreach ($line in ($entryText -split "`n")) {
  if ($line -match "^\s+(en|zh):\s" -and $line -notmatch "^\s+(en|zh):\s*['`"]") {
    throw "description 未加引号：$($line.Trim())"
  }
}
Write-Host '  ✓ 条目字段与引号规则通过'

# ---------- 3. tarball 可达吗 ----------
$tarball = ($entryText -split "`n" | Where-Object { $_ -match '^\s*tarball:\s*' }) -replace '^\s*tarball:\s*', ''
if ($tarball) {
  $resp = curl.exe -s -I -L --max-redirs 5 $tarball.Trim() `
    --resolve github.com:443:20.205.243.166 `
    --resolve objects.githubusercontent.com:443:185.199.108.133 `
    --resolve release-assets.githubusercontent.com:443:185.199.108.133
  $code = ($resp | Select-String -Pattern '^HTTP/[0-9.]+ (\d{3})' | Select-Object -Last 1).Matches.Groups[1].Value
  $len = ($resp | Select-String -Pattern '^content-length:\s*(\d+)' | Select-Object -Last 1).Matches.Groups[1].Value
  if ($code -ne '200') { throw "tarball 取不到：HTTP $code （$tarball）" }
  Write-Host ("  ✓ tarball 200，{0} 字节" -f $len)
}

# ---------- 4. fork 分支上的条目内容必须与本地一致 ----------
$remoteEntry = Api GET "/repos/$Fork/contents/$($EntryRel -replace '\\','/')`?ref=$Branch" $null
$remoteText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($remoteEntry.content))
$normalize = { param($t) ($t -replace "`r`n", "`n").TrimEnd() }
if ((& $normalize $remoteText) -ne (& $normalize $entryText)) {
  throw "fork 分支上的条目与本地 $EntrySrc 不一致，先更新分支再提交。"
}
Write-Host "  ✓ fork:$Branch 上的条目与本地一致"

# ---------- 5. 开 PR ----------
if (-not $Submit) {
  Write-Host ''
  Write-Host '体检完成。加 -Submit 才会真的开 PR。' -ForegroundColor Cyan
  return
}

$upstreamRepo = Api GET "/repos/$Upstream" $null
$base = $upstreamRepo.default_branch
$existing = Api GET "/repos/$Upstream/pulls?head=$($Fork.Split('/')[0]):$Branch&state=open" $null
if ($existing.Count -gt 0) {
  Write-Host ("已存在同源 PR：#{0} {1}" -f $existing[0].number, $existing[0].html_url) -ForegroundColor Yellow
  return
}

$body = @"
Adds ``$TargetRepo`` to **UI Enhancements**.

A bottom-right music dock for the DSH web GUI:

- A draggable capsule that opens into a player card (queue, prev/next, draggable progress bar, volume knob, three loop modes, per-track covers).
- Drag-and-drop local audio, plus Bilibili / NetEase Cloud Music / QQ Music playlist and track links.
- NetEase and QQ audio never reaches the browser as a plain CDN URL: the host signs an opaque HMAC token and the client only ever sees ``/api/dsh-music-on/stream?mt=…``. The two domain allowlists (Bilibili CDN for ``src=``, platform CDN for the token channel) are deliberately separate — merging them would turn that route into an open proxy.
- A spectrum canvas on the page bottom drawn from a real ``AnalyserNode``, in dots / bars / line / wave form, with adjustable bar count, gain, glow, height, frame rate and placement.
- Seven bundled CC0 soundscapes (white noise, rain, cafe, late-night bar, beat, jazz, lo-fi), synthesised by the author, and a settings section with favourites and history tables.

Notes for review:

- ``package.json`` declares ``dsh.bundle`` (``cordis.patch.yml``) as well as ``dsh.client``.
- ``peerDependencies`` carries an explicit prerelease branch (``>=0.2.0-rc.1 <0.2.1-0 || >=0.2.1-0 <0.3.0-0``), so prerelease harness builds are not silently excluded.
- ``screenshots.json`` points at three PNGs inside this repository.
- ``tarball`` uses a **version-free asset name** under ``latest/download/``; every release deliberately uploads an asset literally named ``dsh-music-on.tgz`` so the link never rots.
- Only one entry is added; the generated READMEs are untouched, as the contributing guide requires.
"@

$pr = Api POST "/repos/$Upstream/pulls" @{
  title = $Title
  head  = "$($Fork.Split('/')[0]):$Branch"
  base  = $base
  body  = $body
}
Write-Host ("已开 PR #{0}  {1}" -f $pr.number, $pr.html_url) -ForegroundColor Green
