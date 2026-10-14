# README art: demo cover and GitHub social preview

Made 2026-10-13 by the Design ship's daily pass. The rewritten README (uncommitted, Oct 13)
links two images under `docs/` that did not exist: `docs/demo.gif` (DemoDay makes that from
the MP4) and `docs/demo-cover.png`, the clickable "Watch the full demo" cover. This folder
holds the cover, plus a social preview for the repo.

| File | Size | Use |
| --- | --- | --- |
| `demo-cover.png` | 1280x720 | The README's "Watch the full demo" image. Copied to `docs/demo-cover.png`, the path the README already uses. Also the YouTube thumbnail when the demo is uploaded (YouTube wants 1280x720). |
| `social-preview.png` | 1280x640 | GitHub repo Settings → General → Social preview. Same art without the play button. Shows on X, Slack, Discord and LinkedIn when the repo link is shared, which the SnipKiwi email will do. |
| `cover.html` | | Source for both; `COVER_CLASS` is `` or `social`, `REAL_SHOT` is the original-site capture. |
| `src/kiwi.svg` | | `snipcss/img/kiwi-crying-free.svg` with the tears removed and an eye added. |
| `src/real-light.png`, `src/clone-light.png` | | plugmyplugin.com live (headless Chrome, light scheme) and `demo/dry-run-site/index.html`, both at 1280x800. |

Design: the `/claude` install block's look from `snipcss/css/snipkiwi.css` (ink #14181f,
green #8cc63f, system sans, mono for the command), the README's tagline verbatim, the real
clone-page dry run as the picture: the live site in one window, the clone in the other, the
"0 deviations" result from the Oct 13 dry run in the terminal. The "35 s" on the play label
assumes the 30-40 s demo the CTO's DemoDay prompt asks for; change it if the cut differs.

Render:

```sh
cd design/readme
sed -e 's/COVER_CLASS//' -e 's/REAL_SHOT/real-light.png/' cover.html > /tmp/cover.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1280,720 --screenshot=demo-cover.png file:///tmp/cover.html
sed -e 's/COVER_CLASS/social/' -e 's/REAL_SHOT/real-light.png/' cover.html > /tmp/social.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1280,640 --screenshot=social-preview.png file:///tmp/social.html
```

The live-site capture used `--blink-settings=preferredColorScheme=1` to force the light
scheme (headless Chrome otherwise follows the Mac's dark setting). Nothing is committed; the
CTO's plan is one commit once the GIF exists.
