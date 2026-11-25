# Personal webpage

A lightweight, responsive astronomy portfolio for Tin Mai (Mai Như Tín).

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server
```

The site includes extensionless `/research` and `/contact` pages, with `index.html` as the home page. The homepage uses `ava.jpg` as the profile image and links to `cv.pdf` for the downloadable CV. Research and coursework entries include reserved spaces for figures or animations.

## Home page designs

The home page (`index.html`) is a single page with six views (Home, Education, Research, Simulations, My story, Contact) over a live night sky. React, htm and Lucide are loaded from CDNs, pinned to exact versions, and there is no build step. The sky is a photograph of the Milky Way by ESO/S. Brunier (CC BY 4.0, `assets/milkyway.jpg`). Its Tweaks panel changes colours, type, cards, sky, motion and the page text, and keeps the choices in the visitor's browser. Assets of this design are in `assets/`.

The previous design is kept in two ways:

- `classic/` is the original home page, still served at `/classic/`. The Research, My story and Contact pages (`/research`, `/story`, `/contact`) and the simulations are unchanged.
- The commit `01691ab` (the merge of pull request #50) is the whole site as it was before the new design.

To go back to the original design for good, restore the original home page and remove the new one:

```bash
git checkout 01691ab -- index.html
git rm -r assets classic
git commit -m "Restore the original home page design"
```
