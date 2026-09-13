# ============================================================
#  CardPVP 离线便携包构建脚本
#  用途：把当前的源码构建成"免安装、免联网、免开发环境"的便携包，
#        内置多个 Node 运行时（覆盖 64 位 Win10/11、Win7/8.1、32 位 Windows），
#        以及打包后的服务端、构建好的前端和素材。
#
#  用法（在有开发环境的机器上执行）：
#     powershell -ExecutionPolicy Bypass -File tools\build-offline.ps1
#     powershell -ExecutionPolicy Bypass -File tools\build-offline.ps1 -SkipClientBuild
#
#  产物：
#     CardPVP-Offline\            便携包目录（可直接拷走）
#     CardPVP-Offline-win-x64.zip 便携包压缩包（便于 U 盘传输）
#
#  运行时来源：npmmirror 的 Node 二进制镜像（首次构建会下载到 runtime-cache\）
#      node 20.18.0 x64  → Windows 10/11 64 位、ARM64（x64 模拟）
#      node 12.22.12 x64 → Windows 7 / 8 / 8.1 64 位（Node 12 是最后支持 Win7 的版本）
#      node 12.22.12 x86 → 任意 32 位 Windows（含 32 位 Win7/10）
#
#  注意：本文件必须保存为 "UTF-8 带 BOM"，否则 Windows PowerShell 5.1
#        会按 ANSI 解析中文字符串而报错。
# ============================================================
[CmdletBinding()]
param(
  [string]$RuntimeCache = "",   # 运行时缓存目录，默认 <仓库>\runtime-cache
  [switch]$SkipClientBuild      # 跳过前端构建（client\dist 已是最新时使用）
)

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot          # 仓库根目录
$pkg     = Join-Path $root 'CardPVP-Offline'
$zip     = Join-Path $root 'CardPVP-Offline-win-x64.zip'
$esbuild = Join-Path $root 'client\node_modules\@esbuild\win32-x64\esbuild.exe'
$gbk     = [System.Text.Encoding]::GetEncoding(936)   # 中文 Windows 控制台默认代码页
$utf8bom = New-Object System.Text.UTF8Encoding($true)
if (-not $RuntimeCache) { $RuntimeCache = Join-Path $root 'runtime-cache' }

function Write-Text($path, $text, $encoding) {
  # 统一 CRLF，避免 cmd.exe 解析 LF-only 的 .bat 时错乱
  $text = ($text -replace "`r`n", "`n") -replace "`n", "`r`n"
  [System.IO.File]::WriteAllText($path, $text, $encoding)
}

# ---------- 1. 构建前端 ----------
if (-not $SkipClientBuild) {
  Write-Host '[1/6] 构建前端 (vite build) ...' -ForegroundColor Cyan
  Push-Location (Join-Path $root 'client')
  # vite/esbuild 会把进度输出到 stderr，在 EAP=Stop 下会被当成终止错误，故临时降级
  $ErrorActionPreference = 'Continue'
  & npx vite build
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Pop-Location
  if ($code -ne 0) { throw "vite build 失败 (exit code $code)" }
} else {
  Write-Host '[1/6] 跳过前端构建' -ForegroundColor DarkGray
}

# ---------- 2. 打包服务端 ----------
Write-Host '[2/6] 打包服务端为单文件 ...' -ForegroundColor Cyan
$tmp = Join-Path $root 'build-tmp'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$outFile = Join-Path $tmp 'server.mjs'

# 说明：
#  - target=node12：让同一份产物既能在内置的 Node 20 上跑，也能在 Win7 用的 Node 12 上跑
#    （esbuild 会把 ?? / ?. / class fields 等新语法降级）；
#  - format=esm 才能让源码里的 import.meta.url / __dirname 正常工作；
#  - express、socket.io 等是 CJS 包，bundle 进 ESM 后必须注入 createRequire 的 banner，
#    否则运行时报 "Dynamic require of xxx is not supported"；
#  - banner 里顺带补 Array/String.prototype.at（Node 16.6+ 才有，Node 12 没有）；
#  - Node 12 不认 "node:" 前缀，故用 --alias 把 node:crypto 映射成 crypto（banner 用 'module'）。
$banner = "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url); " +
  "if (!Array.prototype.at) { Object.defineProperty(Array.prototype, 'at', { value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return (i < 0 || i >= this.length) ? undefined : this[i]; }, writable: true, configurable: true }); } " +
  "if (!String.prototype.at) { Object.defineProperty(String.prototype, 'at', { value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return (i < 0 || i >= this.length) ? undefined : this[i]; }, writable: true, configurable: true }); }"

$ErrorActionPreference = 'Continue'
& $esbuild (Join-Path $root 'server\src\index.ts') `
  --bundle --platform=node --format=esm --target=node12 `
  "--outfile=$outFile" `
  --alias:node:crypto=crypto `
  --external:bufferutil --external:utf-8-validate `
  "--banner:js=$banner"
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0 -or -not (Test-Path $outFile)) { throw "esbuild 打包服务端失败 (exit code $code)" }

# ---------- 3. 准备 Node 运行时 ----------
Write-Host '[3/6] 准备 Node 运行时 ...' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $RuntimeCache | Out-Null

# Name = 包内文件名；Ver/Arch = 镜像路径；Desc = 说明
$runtimes = @(
  [pscustomobject]@{ Name = 'node-x64.exe';        Ver = 'v20.18.0';  Arch = 'x64'; Desc = 'Windows 10/11 64位 / ARM64' },
  [pscustomobject]@{ Name = 'node-legacy-x64.exe'; Ver = 'v12.22.12'; Arch = 'x64'; Desc = 'Windows 7/8/8.1 64位' },
  [pscustomobject]@{ Name = 'node-legacy-x86.exe'; Ver = 'v12.22.12'; Arch = 'x86'; Desc = '32位 Windows' }
)

foreach ($rt in $runtimes) {
  $dest = Join-Path $RuntimeCache $rt.Name
  if (-not (Test-Path $dest)) {
    $url = "https://registry.npmmirror.com/-/binary/node/$($rt.Ver)/win-$($rt.Arch)/node.exe"
    Write-Host "      下载 $($rt.Ver) win-$($rt.Arch) ..."
    # 用 node 内置 fetch 下载（避免某些 Windows 上 Invoke-WebRequest 的 TLS/schannel 问题）
    $ErrorActionPreference = 'Continue'
    & node -e "fetch(process.argv[1]).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(b=>require('fs').writeFileSync(process.argv[2],Buffer.from(b)))" $url $dest
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0 -or -not (Test-Path $dest)) { throw "下载 node.exe 失败: $url（可手动放到 $dest）" }
  }
  # 验证能跑起来并打印版本
  $ver = & $dest -v
  if ($LASTEXITCODE -ne 0) { throw "运行时无法执行: $dest" }
  Write-Host ("      {0,-20} {1}  ({2})" -f $rt.Name, $ver, $rt.Desc) -ForegroundColor DarkGray
}

# ---------- 4. 组装目录 ----------
Write-Host '[4/6] 组装便携包目录 ...' -ForegroundColor Cyan
Remove-Item $pkg -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'server\dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'client') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'runtime') | Out-Null

Copy-Item (Join-Path $tmp 'server.mjs')             (Join-Path $pkg 'server\dist\index.mjs')
Copy-Item (Join-Path $root 'server\src\admin.html') (Join-Path $pkg 'server\dist\admin.html')
Copy-Item (Join-Path $root 'client\dist')           (Join-Path $pkg 'client\dist') -Recurse
Copy-Item (Join-Path $root 'assets')                (Join-Path $pkg 'assets') -Recurse

# 规则文档由前端 fetch('/RULE.md') 读取，必须放进 dist 由 express.static 提供
Copy-Item (Join-Path $root 'RULE.md')    (Join-Path $pkg 'client\dist\RULE.md')
Copy-Item (Join-Path $root 'RULE_EN.md') (Join-Path $pkg 'client\dist\RULE_EN.md')

foreach ($rt in $runtimes) {
  Copy-Item (Join-Path $RuntimeCache $rt.Name) (Join-Path $pkg "runtime\$($rt.Name)")
}

# ---------- 5. 生成启动脚本与说明 ----------
Write-Host '[5/6] 生成启动脚本与说明 ...' -ForegroundColor Cyan

$launch = @'
@echo off
chcp 936 >nul
cd /d "%~dp0"
title CardPVP 局域网对战服务 (关闭本窗口即停止服务)

rem ================= 自动选择合适的 Node 运行时 =================
set "ARCH=%PROCESSOR_ARCHITECTURE%"
if not "%PROCESSOR_ARCHITEW6432%"=="" set "ARCH=%PROCESSOR_ARCHITEW6432%"

set "VERNUM=?"
set "VERSTR="
for /f "tokens=2 delims=[]" %%v in ('ver') do set "VERSTR=%%v"
for /f "tokens=2" %%v in ("%VERSTR%") do set "VERNUM=%%v"
set "OSMAJ="
for /f "tokens=1 delims=." %%v in ("%VERNUM%") do set "OSMAJ=%%v"
if "%OSMAJ%"=="" set "OSMAJ=10"

set "RUNTIME=node-x64.exe"
set "RTDESC=64位 Windows 10/11 (Node 20.18.0 x64)"
if /i "%ARCH%"=="x86" (
  set "RUNTIME=node-legacy-x86.exe"
  set "RTDESC=32位 Windows (Node 12.22.12 x86)"
) else (
  if %OSMAJ% LSS 10 (
    set "RUNTIME=node-legacy-x64.exe"
    set "RTDESC=Windows 7/8/8.1 64位 (Node 12.22.12 x64)"
  )
)
rem 手动覆盖：在本目录建 runtime.txt，第一行写运行时文件名（例如 node-legacy-x64.exe）
if exist runtime.txt (
  set /p RUNTIME=<runtime.txt
  set "RTDESC=由 runtime.txt 手动指定"
)

echo ============================================================
echo                     CardPVP  局域网对战
echo ============================================================
echo   系统: %ARCH% / Windows %VERNUM%
echo   运行时: runtime\%RUNTIME%   [%RTDESC%]
echo ============================================================
if not exist "runtime\%RUNTIME%" (
  echo [错误] 找不到 runtime\%RUNTIME%，便携包不完整。
  pause
  exit /b 1
)
echo.
echo  【本机】在这台电脑上玩，用浏览器打开：
echo        http://localhost:3001
echo.
echo  【局域网】同一路由器/交换机/热点下的手机、平板、其他电脑，
echo  请用浏览器打开下面任意一个地址：
setlocal enabledelayedexpansion
set FOUND=0
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "ip=%%a"
  set "ip=!ip: =!"
  if not "!ip!"=="" (
    echo        http://!ip!:3001
    set FOUND=1
  )
)
if "!FOUND!"=="0" echo        [未检测到局域网 IP：请先连上路由器/交换机/手机热点]
endlocal
echo.
echo  浏览器自检（页面白屏/打不开时先访问这个地址）：
echo        http://localhost:3001/check.html
echo.
echo.
echo  玩法：一台设备开房间拿到 4 位房间号，另一台设备在大厅输入房间号加入。
echo  打不开时：右键以管理员身份运行 "开放防火墙端口.bat"。
echo ------------------------------------------------------------
echo.

rem 等 3 秒后自动在本机打开浏览器（此时服务已就绪）
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:3001"

".\runtime\%RUNTIME%" ".\server\dist\index.mjs"
set "RC=%ERRORLEVEL%"

echo.
echo 服务已停止。
if not "%RC%"=="0" (
  echo [提示] 服务异常退出，错误码 %RC%。
  echo 如果是一闪而过、或提示"不是有效的 Win32 应用程序"/"缺少 DLL"/"无法定位程序输入点"，
  echo 请在本目录新建 runtime.txt，内容写下面某一个可用的运行时名称（含扩展名）：
  echo        node-x64.exe          64位 Windows 10/11
  echo        node-legacy-x64.exe   Windows 7/8/8.1 64位
  echo        node-legacy-x86.exe   32位 Windows（任意版本）
)
echo 按任意键关闭窗口......
pause >nul
'@
Write-Text (Join-Path $pkg '启动游戏.bat') $launch $gbk

$fw = @'
@echo off
chcp 936 >nul
cd /d "%~dp0"
title 开放 CardPVP 防火墙端口

net session >nul 2>&1
if errorlevel 1 (
  echo 需要管理员权限，正在尝试以管理员身份重新运行......
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo 正在开放入站 TCP 3001 端口（所有网络类型）......
netsh advfirewall firewall delete rule name="CardPVP LAN" >nul 2>&1
netsh advfirewall firewall add rule name="CardPVP LAN" dir=in action=allow protocol=TCP localport=3001 profile=any
echo.
echo 完成。局域网设备现在应可访问 http://本机IP:3001
echo 按任意键关闭......
pause >nul
'@
Write-Text (Join-Path $pkg '开放防火墙端口.bat') $fw $gbk

$readme = @'
CardPVP 局域网离线版 —— 使用说明
================================================

这个文件夹是一个"开箱即用"的便携包：里面自带 3 个版本的 Node 运行时、
打包好的服务端、构建好的前端页面和全部图片素材。目标电脑不需要安装 Node、
不需要 npm、不需要联网、不需要任何开发环境。

------------------------------------------------
一、怎么启动
------------------------------------------------
1. 把整个 CardPVP-Offline 文件夹拷到目标电脑（U 盘/移动硬盘均可），
   建议放在没有中文和空格的路径下，例如 D:\CardPVP-Offline
2. 双击 "启动游戏.bat"
   - 它会自动判断系统版本和位数，挑一个能用的 Node 运行时（窗口里会写明用了哪个）
   - 然后弹出服务器窗口，列出局域网地址，并自动在本机打开浏览器
   - 这个黑窗口就是服务器，关掉它游戏就停止（对局数据也会清空）
3. 第一次运行时 Windows 可能弹出防火墙提示，勾选"专用网络"并点"允许访问"。
   如果没有弹窗、或局域网设备打不开，就右键"以管理员身份运行"
   "开放防火墙端口.bat"，它会给 TCP 3001 端口放行。

------------------------------------------------
二、内置的 3 个运行时（自动选择，一般不用管）
------------------------------------------------
runtime\node-x64.exe           Node 20.18.0  → Windows 10 / 11 64 位、ARM64
runtime\node-legacy-x64.exe    Node 12.22.12 → Windows 7 / 8 / 8.1 64 位
runtime\node-legacy-x86.exe    Node 12.22.12 → 32 位 Windows（含 32 位 Win7/Win10）

说明：Node 12 是最后一个官方支持 Windows 7 的版本，所以老系统走它。
如果自动选择不合适（例如运行时报"不是有效的 Win32 应用程序"、缺少 DLL、
"无法定位程序输入点"），在本目录新建一个 runtime.txt 文本文件，
第一行写上一个可用的运行时文件名即可，例如：

    node-legacy-x64.exe

------------------------------------------------
三、怎么联机（同一局域网内两台设备）
------------------------------------------------
方式 A：同一台电脑上两个人玩（最简单）
  - 打开两个浏览器窗口（或一个正常窗口 + 一个无痕窗口）
  - 都访问 http://localhost:3001
  - 一个人"创建房间"拿到 4 位房间号，另一个人输入房间号加入

方式 B：两台设备（电脑 / 手机 / 平板）
  - 两台设备连同一个路由器 / 交换机 / Wi-Fi
  - 主机（跑着黑窗口的那台）访问 http://localhost:3001
  - 另一台设备访问 http://主机IP:3001（IP 见黑窗口里列出的地址，
    手机可以直接在浏览器里手工输入，例如 192.168.1.7:3001）
  - 谁先创建房间，另一台在大厅输入 4 位房间号加入即可

方式 C：没有路由器也能联机
  - Windows 自带"移动热点"：设置 → 网络和 Internet → 移动热点 → 打开
  - 手机/平板连这个热点，再用热点网段的 IP（黑窗口里会列出）访问 :3001

------------------------------------------------
四、常见问题
------------------------------------------------
1) 局域网设备打不开页面
   - 99% 是防火墙：运行"开放防火墙端口.bat"（管理员）
   - 确认两台设备在同一网段（IP 前三段相同），且没开"客户端隔离/AP 隔离"
   - 公司/学校网络常禁止设备互访，换手机热点试试

2) 黑窗口里列出多个 IP，用哪个？
   - 一般选 192.168.x.x / 10.x.x.x / 172.16~31.x.x 里"正在用的那块网卡"
   - VirtualBox、VMware、WSL、VPN 的虚拟网卡地址（如 192.168.56.x）不要用

3) 提示端口被占用（EADDRINUSE）
   - 说明 3001 端口已被别的程序占用，关掉旧的黑窗口/旧进程再启动
   - 命令：netstat -ano | findstr :3001 查出占用进程

4) 页面能开但连不上房间 / 一直转圈
   - 确认客户端访问的就是服务器的地址（页面必须由 :3001 提供，
     不要用 file:// 直接打开 index.html）

5) 想清空所有房间数据
   - 关掉黑窗口再重新启动即可（房间只存在内存里）

6) Windows 7 上打不开游戏页面 / 360 等国产浏览器能不能用
   - 游戏页面是 React 单页应用，Win7 自带的 IE11 跑不动
   - 360安全浏览器、QQ浏览器、搜狗浏览器等国产浏览器都是"双内核"：
     IE 兼容模式不能玩，必须切到"极速模式"（Chromium 内核）。
     切换方法：地址栏右侧点闪电/极速图标，或在设置里把内核模式改成
     "全部使用极速模式"，然后刷新页面
   - 内核要求：Chromium 80 以上（前端已按 chrome80 目标构建）。
     360安全浏览器 12/13（Chromium 86 内核）及以上都能跑，14（Chromium 108）最稳；
     内核低于 80 的老浏览器会白屏，请升级浏览器，或用下面的备选方案
   - 已在 Chromium 80 内核上实测（Win7 + 搜狗高速浏览器 80.0.3987 内核）：
     功能完全正常。老内核不支持 flex 布局的 gap，前端已内置自动补丁
     （client/public/flexgap-shim.js，只在检测到不支持 flex gap 时才生效），
     间距显示正常；现代浏览器渲染结果与打补丁前逐像素一致
   - 拿不准就用自检页：在同一个浏览器里打开
     http://服务器IP:3001/check.html
     它会显示浏览器内核版本，并直接告诉你"可以运行 / 基本可用 / 跑不了"及原因
   - 备选方案（最稳）：让 Win7 只当服务器，用手机/平板当"另一台设备"，
     在手机浏览器里访问 http://Win7的IP:3001 玩（手机浏览器肯定没问题）

7) Windows 7 上提示缺少 DLL / 无法定位程序输入点
   - 自带的 node.exe 都是静态链接 C 运行库的，正常不需要额外组件；
     若确实报错，说明系统太旧（Win7 需 SP1 且装过系统更新），
     可尝试改用另一个运行时（见"二、内置的 3 个运行时"）

------------------------------------------------
五、目录说明
------------------------------------------------
runtime\                     3 个 Node 运行时（自动选择，无需安装）
server\dist\index.mjs        打包好的服务端（含 express / socket.io）
server\dist\admin.html       房间管理后台页面
client\dist\                 构建好的前端页面（含 RULE.md 规则文档、check.html 自检页）
assets\                      图片等素材（服务端以 /assets 提供）
浏览器自检：http://localhost:3001/check.html （判断当前浏览器能不能跑游戏）
启动游戏.bat                 双击启动
开放防火墙端口.bat           局域网设备连不上时用（需管理员）
使用说明.txt                 本文件

管理后台：http://localhost:3001/admin （查看/强制删除房间，3 秒自动刷新）
'@
Write-Text (Join-Path $pkg '使用说明.txt') $readme $utf8bom

# ---------- 6. 打包 zip ----------
Write-Host '[6/6] 打包 zip ...' -ForegroundColor Cyan
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $pkg -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "完成！" -ForegroundColor Green
Write-Host "  便携包目录: $pkg"
Write-Host "  压缩包    : $zip  ($size MB)"
