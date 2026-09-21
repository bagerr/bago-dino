# Sending the game to someone

`index2.html` loads its art from the PNGs sitting next to it. Mail that file
on its own and the other person gets a game with no graphics — which is
exactly what happens if you attach only the HTML.

There are two ways to hand it over.

## 1. One file (what to send)

```
node build-standalone.js
```

writes **`neon-dino-age.html`** (~7.5 MB): the game with every sprite inlined
as a `data:` URI **and every `src/*.js` file inlined as its own script tag**,
in the order index2.html lists them. It needs no folder, no server and no
internet. Send that one file; double-clicking it works on Windows, macOS,
Android and iPad.

The script tags are kept separate inside the bundle rather than merged into
one, so the bundle loads under the same rules the folder build does — a
declaration that does not hoist across files in one build must not hoist in
the other either, or the bundle could work where the source does not.

The game reads its art through `assetURL(name)`, which checks
`window.__ASSETS` first and falls back to the filename. That is the whole
mechanism: the bundle defines `window.__ASSETS`, the source build does not,
and the same `index2.html` serves both.

Verify a bundle before sending it — the suite runs against any build:

```
node smoke-test.js neon-dino-age.html
```

## 2. A link (what to send a tablet)

A file is not a link. `file:///C:/...` only exists on the machine it is on,
and a `.html` attachment arriving through a messaging app is handed to the OS
as a document — on Android and iOS tapping it usually opens a file viewer or
a download screen, not a browser. For a tablet, publish it and send a URL.

The repository is already a complete static site: `index2.html` reads its art
through `assetURL()`, which falls back to the plain filename, and every one
of those files is tracked. So GitHub Pages can serve the folder as it stands
— **no bundle, no copies, no duplicated art.**

```
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

then **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**.
A minute later the game is at:

```
https://<user>.github.io/<repo>/index2.html
```

`.nojekyll` at the root is what stops Pages running the file list through
Jekyll before serving it.

**The bare URL works too.** Pages answers `…/<repo>/` with `index.html` and
with nothing else, so that name now holds a redirect to `index2.html` and the
arcade build moved, byte for byte, to `arcade.html`. Both addresses open the
current game:

```
https://<user>.github.io/<repo>/            → redirects
https://<user>.github.io/<repo>/index2.html → direct
```

The redirect is done in script first so the query string survives, with a
meta refresh behind it and a plain link behind that. Touch controls detect
the device on their own; `?touch=1` on the end forces them on for testing
from a desktop, and it survives the redirect.

Rebuilding the bundle is not part of this route. Push a change and Pages
picks it up; that is the whole deploy.

## 3. The folder

Zip the whole directory. Smaller to transfer and the art stays editable, but
the other person has to keep the files together.

---

## Re-encoding the art

`build-standalone.js` only assembles; the encoded art lives in
`assets-inline.json`. **Re-run this step whenever the art changes**, then
rebuild. It uses Windows Imaging Component — no npm packages.

Two rules the script follows and you should keep:

- **Four sheets keep their exact pixel grid**: `ground.png`,
  `forest_ground.png`, `ice_ground.png` and `ice_icicle.png`. The game samples
  hard-coded source rows out of them (`GROUND_SRC_Y`, the biome `cap` bands,
  the icicle's source rect), so rescaling them silently moves the walking
  surface off the collision line.
- Everything else is only ever drawn small, so sprites go to 384px on the
  long edge and the three backdrops to 640px as JPEG.

```powershell
Add-Type -AssemblyName PresentationCore
$root = (Get-Location).Path   # run it FROM the project directory. PowerShell 5.1
                              # reads a UTF-8 script as ANSI, so a literal path with
                              # Turkish letters in it comes back mangled and nothing
                              # resolves.
$keepFull = @("ground.png","forest_ground.png","ice_ground.png","ice_icicle.png")
$asJpeg   = @("forest_bg.png","ice_bg.png","volcano_bg.png")
$skip     = @("portal.jpg")   # only the onerror fallback; portal.png is bundled

# the game is split across src/*.js now, so the asset names live there too
$html = (Get-Content (Join-Path $root "index2.html") -Raw)
foreach ($f in Get-ChildItem (Join-Path $root "src") -Filter *.js) { $html += (Get-Content $f.FullName -Raw) }
$names = [regex]::Matches($html, '"([\w./-]+\.(?:png|jpg|jpeg|webp))"') |
         ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

$out = @{}
foreach ($n in $names) {
  if ($skip -contains $n) { continue }
  $p = Join-Path $root $n
  if (-not (Test-Path $p)) { Write-Output ("  missing " + $n); continue }
  $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
           (New-Object System.Uri($p)), 'None', 'OnLoad')
  $fr = $dec.Frames[0]
  $img = [System.Windows.Media.Imaging.BitmapSource]$fr
  $maxDim = if ($keepFull -contains $n) { 0 } elseif ($asJpeg -contains $n) { 640 } else { 384 }
  if ($maxDim -gt 0) {
    $big = [Math]::Max($fr.PixelWidth, $fr.PixelHeight)
    if ($big -gt $maxDim) {
      $s = $maxDim / $big
      $img = New-Object System.Windows.Media.Imaging.TransformedBitmap(
               $fr, (New-Object System.Windows.Media.ScaleTransform($s, $s)))
    }
  }
  if ($asJpeg -contains $n) {
    $enc = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
    $enc.QualityLevel = 78
    $mime = "image/jpeg"
  } else {
    $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $mime = "image/png"
  }
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($img))
  $ms = New-Object System.IO.MemoryStream
  $enc.Save($ms); $bytes = $ms.ToArray(); $ms.Close()
  $out[$n] = "data:$mime;base64," + [Convert]::ToBase64String($bytes)
  Write-Output ("  {0,-24} {1,4}x{2,-4} -> {3,6} KB" -f $n, $img.PixelWidth, $img.PixelHeight, [int]($bytes.Length/1024))
}
$payload = "{" + (($out.Keys | Sort-Object | ForEach-Object { '"' + $_ + '":"' + $out[$_] + '"' }) -join ",") + "}"
Set-Content -Path (Join-Path $root "assets-inline.json") -Value $payload -Encoding utf8 -NoNewline
```

(`Set-Content -Encoding utf8` writes a BOM; the builder strips it.)

## Playing on a tablet

Touch is detected automatically and an on-screen pad appears in a stage:
left/right on the left, FIRE and JUMP on the right, DASH above them. Hold
JUMP for the jetpack. A thumb sliding from one button to another hands the
key over rather than sticking.

Off-stage there are no buttons, because every other screen wants one tap: tap
a node on the mission map to start that world, and tap anywhere to confirm a
debrief, spend a continue, or restart after a game over.
