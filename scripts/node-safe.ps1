param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

# In the Codex tool sandbox, some core Windows env vars may be blank.
# Node can assert during crypto init (ncrypto::CSPRNG) if these are missing.
if ([string]::IsNullOrWhiteSpace($env:SystemRoot)) { $env:SystemRoot = 'C:\Windows' }
if ([string]::IsNullOrWhiteSpace($env:windir)) { $env:windir = 'C:\Windows' }
if ([string]::IsNullOrWhiteSpace($env:ComSpec)) { $env:ComSpec = 'C:\Windows\System32\cmd.exe' }

if ([string]::IsNullOrWhiteSpace($env:APPDATA) -and $env:USERPROFILE) {
  $env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -and $env:USERPROFILE) {
  $env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
}

& node @Args
exit $LASTEXITCODE

