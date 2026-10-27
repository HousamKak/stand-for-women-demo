[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')]
    [string]$RepositoryName = 'stand-for-women-demo',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]*$')]
    [string]$Account = 'HousamKak',
    [switch]$PrepareOnly,
    [switch]$NoWait
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$StagePath = Join-Path $ProjectRoot '.github-publish'
$StatePath = Join-Path $ProjectRoot '.github-publish-state.json'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed. Publishing stopped without forcing any remote changes." }
}

Push-Location -LiteralPath $ProjectRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer first.' }
    Invoke-Checked 'node' @('scripts/build-pages.mjs', $RepositoryName)
    if ($PrepareOnly) {
        Write-Host 'Prepared and ready: pages-dist. No GitHub changes were made.'
        return
    }
    foreach ($CommandName in @('gh', 'git')) {
        if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) { throw "Install $CommandName first, then run this script again." }
    }
    $ProfileJson = & gh api user
    if ($LASTEXITCODE -ne 0) { throw 'GitHub is unavailable or authentication is missing. Run gh auth login in this PowerShell window, then retry.' }
    $GitHubProfile = $ProfileJson | ConvertFrom-Json
    if ($GitHubProfile.login -ne $Account) { throw "The active GitHub account is $($GitHubProfile.login). Sign in as $Account, or pass -Account explicitly." }
    $FullName = "$Account/$RepositoryName"
    $RemoteUrl = "https://github.com/$FullName.git"
    $KnownState = $null
    if (Test-Path -LiteralPath $StatePath) { $KnownState = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json }
    if ($KnownState -and $KnownState.repository -ne $FullName) { throw 'This publisher is already associated with another repository. Use that repository or a separate project copy.' }

    $RepoJson = & gh repo view $FullName --json nameWithOwner,isEmpty 2>$null
    $RepoExists = $LASTEXITCODE -eq 0
    if ($RepoExists -and -not $KnownState) {
        $MarkerBase64 = & gh api "repos/$FullName/contents/sfw-demo.json" --jq .content 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Repository $FullName already exists and is not identified as this demo. Choose a different -RepositoryName; it will not be overwritten." }
        $Marker = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($MarkerBase64 -join ''))) | ConvertFrom-Json
        if ($Marker.site -ne 'standforwomen-sales-demo') { throw 'The remote repository is not this demo. Publishing stopped.' }
    }
    if (-not $RepoExists) {
        Invoke-Checked 'gh' @('repo','create',$FullName,'--public','--description','Stand For Women website redesign - sales demonstration')
    }
    @{ repository = $FullName; site = 'standforwomen-sales-demo' } | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8

    New-Item -ItemType Directory -Path $StagePath -Force | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $StagePath '.git'))) {
        Invoke-Checked 'git' @('-C',$StagePath,'init','--initial-branch=main')
        Invoke-Checked 'git' @('-C',$StagePath,'remote','add','origin',$RemoteUrl)
    }
    $ActualRemote = & git -C $StagePath remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $ActualRemote -ne $RemoteUrl) { throw 'The publisher remote differs from the selected repository.' }
    # GitHub CLI supplies credentials through its standard helper; tokens never enter files or arguments.
    Invoke-Checked 'git' @('-C',$StagePath,'config','--local','--replace-all','credential.https://github.com.helper','!gh auth git-credential')
    Invoke-Checked 'git' @('-C',$StagePath,'config','user.name',$GitHubProfile.login)
    Invoke-Checked 'git' @('-C',$StagePath,'config','user.email',"$($GitHubProfile.id)+$($GitHubProfile.login)@users.noreply.github.com")
    $RemoteMain = & git -C $StagePath ls-remote --heads origin refs/heads/main
    if ($LASTEXITCODE -ne 0) { throw 'Cannot contact the remote Git repository.' }
    if ($RemoteMain) {
        $ExistingChanges = & git -C $StagePath status --porcelain
        if ($ExistingChanges) { throw 'The publisher checkout has pending changes. Review them before retrying; they were not discarded.' }
        Invoke-Checked 'git' @('-C',$StagePath,'fetch','origin','main')
        & git -C $StagePath rev-parse --verify HEAD 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Invoke-Checked 'git' @('-C',$StagePath,'merge','--ff-only','origin/main') }
        else { Invoke-Checked 'git' @('-C',$StagePath,'checkout','-b','main','origin/main') }
    }

    # Copy only the website. Proposals, source archives, logs, credentials and Sites identity are excluded.
    foreach ($DirectoryName in @('src','dist','worker','supabase','scripts','tests','.github')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $DirectoryName) -Destination $StagePath -Recurse -Force
    }
    foreach ($FileName in @('package.json','build.mjs','server.mjs','README.md','wrangler.jsonc','Start Demo.cmd','Publish-GitHub.ps1','.gitignore')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $FileName) -Destination $StagePath -Force
    }
    $DocsPath = [IO.Path]::GetFullPath((Join-Path $StagePath 'docs'))
    $ExpectedStage = [IO.Path]::GetFullPath($StagePath).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $DocsPath.StartsWith($ExpectedStage, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($DocsPath) -ne 'docs') {
        throw 'The generated docs directory is outside the intended publisher checkout.'
    }
    if (Test-Path -LiteralPath $DocsPath) { Remove-Item -LiteralPath $DocsPath -Recurse -Force }
    New-Item -ItemType Directory -Path $DocsPath -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'pages-dist') -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $DocsPath -Recurse -Force
    }
    @{ site = 'standforwomen-sales-demo'; repository = $FullName } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StagePath 'sfw-demo.json') -Encoding UTF8
    Invoke-Checked 'git' @('-C',$StagePath,'add','--all')
    & git -C $StagePath diff --cached --quiet
    if ($LASTEXITCODE -eq 1) { Invoke-Checked 'git' @('-C',$StagePath,'commit','-m','Publish Stand For Women sales demo') }
    elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the staged changes.' }
    Invoke-Checked 'git' @('-C',$StagePath,'push','--set-upstream','origin','main')
    $Commit = & git -C $StagePath rev-parse HEAD

    $PagesJson = & gh api "repos/$FullName/pages" 2>$null
    $PagesExists = $LASTEXITCODE -eq 0
    $Settings = @{ build_type = 'workflow' } | ConvertTo-Json -Compress
    $Method = if ($PagesExists) { 'PUT' } else { 'POST' }
    $ResponseJson = $Settings | & gh api --method $Method "repos/$FullName/pages" --input -
    if ($LASTEXITCODE -ne 0) { throw 'Source was pushed, but Pages configuration failed. Check repository Settings > Pages and select GitHub Actions.' }
    $PagesInfo = $ResponseJson | ConvertFrom-Json
    if (-not $PagesInfo.html_url) { $PagesInfo = (& gh api "repos/$FullName/pages") | ConvertFrom-Json }
    $LiveUrl = $PagesInfo.html_url
    Write-Host "Repository: https://github.com/$FullName"
    Write-Host "Pages URL: $LiveUrl"
    Invoke-Checked 'gh' @('workflow','run','pages.yml','--repo',$FullName,'--ref','main')
    if ($NoWait) { Write-Host 'The Pages deployment workflow was requested. The deployment is not verified yet.'; return }
    for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
        $BuildJson = & gh api "repos/$FullName/actions/workflows/pages.yml/runs?head_sha=$Commit&per_page=1" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $BuildInfo = ($BuildJson | ConvertFrom-Json).workflow_runs | Select-Object -First 1
            if ($BuildInfo.conclusion -eq 'success' -and $BuildInfo.head_sha -eq $Commit) {
                $Response = Invoke-WebRequest -Uri $LiveUrl -UseBasicParsing -TimeoutSec 20
                if ($Response.StatusCode -eq 200) { Write-Host "Verified live: $LiveUrl"; return }
            }
            if ($BuildInfo.conclusion -in @('failure','cancelled','timed_out') -and $BuildInfo.head_sha -eq $Commit) { throw 'The Pages deployment workflow did not complete successfully. Review its GitHub Actions logs.' }
        }
        Start-Sleep -Seconds 6
    }
    Write-Host 'The source and Pages settings were saved. Publication is still pending; check the Pages build in GitHub.'
}
finally { Pop-Location }
