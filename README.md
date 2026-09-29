# kolja.com.br

The home of everything Kölja, served by GitHub Pages from this repo (CNAME: kolja.com.br).

| Path | What |
|---|---|
| `/` (`index.html`, `assets/hub.*`) | **The homepage.** Kölja Records: a record that plays the label's featured releases right on the page (YouTube player, visible while playing; the tonearm follows the song). The list is read live from `records/` (the `kolja-public-data` block): releases marked *featured*, newest first, up to 8, so a new release appears on the homepage once it is marked featured and exported from Kölja Records Studio; nothing on the homepage has to be edited by hand, and it shows no counts that could go stale. Kölja Games: the five games, each linking to its page. Contact: email and Instagram. |
| `/records/` | **Kölja Records**: the label site that used to be the root. Changed: a *Kölja* nav link back to the homepage, and every São Paulo/Brazil mention removed (text and the data block's `location`). Clear the location in Kölja Records Studio too, or a re-export brings it back. |
| `/games/` | **Kölja Games**: the studio page (Salt Meridian featured; Nightmare Engine, Hero City, Galactic Frontier, Brick Stacker 3D with media). |
| `/games/salt-meridian/` | **Salt Meridian**: the game's own page. |

Preview locally: `python3 -m http.server 8794` in this folder, then http://localhost:8794/.

To change which releases the record plays, mark them *featured* in Kölja Records Studio and re-export `records/index.html`; the homepage picks them up (it keeps a copy of the current list in `index.html` for no-JS visitors).

## Publishing

GitHub Pages serves `main` from the root (CNAME kolja.com.br). Push to `main` and the site updates within a minute or two.
The `the-one-and-only-niko` account has write access to this repo, so the command line can push directly.

Moving the label to `/records/` means old links like `kolja.com.br/#catalog` now open the homepage; its Kölja Records
section and the nav both lead to the label.

`games/` was copied from `~/Documents/Developer/kolja-games-site` (whose README lists every media source); this repo is
the copy to edit.
