param([int]$Port = 5173, [switch]$Preview, [switch]$Lan, [switch]$Build)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if ($taskNode) {
  $taskNodePath = $taskNode.Source
} else {
  $taskNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $taskNodePath)) { throw 'Node.js 22.12 이상을 설치해 주세요.' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw '먼저 pnpm install 또는 npm install을 실행해 주세요.' }
if ($Build) {
  & $taskNodePath 'node_modules/vite/bin/vite.js' build
  if ($LASTEXITCODE -ne 0) { throw '빌드에 실패했습니다. 위 오류를 확인해 주세요.' }
}
$taskBindAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
if ($Preview -and -not (Test-Path -LiteralPath 'dist/index.html')) { throw '빌드 결과가 없습니다. -Build -Preview 옵션으로 실행해 주세요.' }
if ($Preview) {
  & $taskNodePath 'node_modules/vite/bin/vite.js' preview --host $taskBindAddress --port $Port
} else {
  & $taskNodePath 'node_modules/vite/bin/vite.js' --host $taskBindAddress --port $Port
}
