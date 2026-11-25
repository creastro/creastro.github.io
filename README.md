# Personal webpage

A lightweight, responsive astronomy portfolio for Tin Mai (Mai Như Tín).

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server
```

The site includes extensionless `/research` and `/contact` pages, with `index.html` as the home page. The homepage uses `ava.jpg` as the profile image and links to `cv.pdf` for the downloadable CV. Research and coursework entries include reserved spaces for figures or animations.

## Site design

The home page (`index.html`) is a single page with six views (Home, Education, Research, Simulations, My story, Contact) over a live night sky. React, htm and Lucide are loaded from CDNs, pinned to exact versions, and there is no build step. The sky is a photograph of the Milky Way by ESO/S. Brunier (CC BY 4.0, `assets/milkyway.jpg`). Its Tweaks panel changes colours, type, cards, sky, motion and the page text, and keeps the choices in the visitor's browser. Assets of this design are in `assets/`.

`/research/`, `/story/`, `/contact/` and `/simulations/` are small pages that forward to the matching view (`/#research` and so on), so old links keep working. The page of each simulation under `simulations/<name>/` keeps its own design for now.

The previous design is kept in two ways:

- `classic/` holds the original home, research, story, contact and simulations pages, served at `/classic/`.
- The commit `01691ab` (the merge of pull request #50) is the whole site as it was before the new design.

To go back to the original design for good, restore the original pages and remove the new design:

```bash
git checkout 01691ab -- index.html research story contact simulations/index.html
git rm -r assets classic
git commit -m "Restore the original site design"
```

A new simulation card goes into the `SIMS` list in `index.html` (and into `simulations/index.html` if you want it in the classic gallery).
