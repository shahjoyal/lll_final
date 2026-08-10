LADIES, LEADERSHIP & LOGISTICS — Website
==========================================

WHAT'S IN THIS FOLDER
----------------------
index.html   → the site
styles.css   → all styling, animations, gold/white theme
script.js    → scroll animations, nav, episode links, toast
README.txt   → this file

HOW TO ADD YOUR IMAGES (REQUIRED)
----------------------------------
Place these 7 image files in the SAME folder as index.html,
using these exact filenames (lowercase, .png):

  lll.png        → your logo (used in navbar, hero, footer)
  founder.png    → Aayushi's photo (portrait works best, 4:5 ratio)
  img1.png       → Episode 01 thumbnail (Coming Soon card)
  img2.png       → Episode 02 thumbnail
  img3.png       → Episode 03 thumbnail
  img4.png       → Episode 04 thumbnail
  img5.png       → Episode 05 thumbnail

The episode thumbnails look best as square (1:1) images — a YouTube
thumbnail or a cropped frame from each video works well.

HOW TO VIEW IT
---------------
Just double-click index.html to open it in any browser. For the
best experience (and to avoid any local file-security warnings),
run a tiny local server from this folder instead:

  Python:  python3 -m http.server 8000   → open http://localhost:8000
  Node:    npx serve .                    → open the URL it gives you

HOW TO PUBLISH IT (FREE OPTIONS)
----------------------------------
- Netlify Drop: netlify.com/drop → drag this whole folder in
- Vercel: vercel.com → "Add New Project" → drag/upload the folder
- GitHub Pages: push this folder to a GitHub repo → enable Pages
  in Settings → your site goes live at yourname.github.io/repo

Any of these give you a free live link in under a minute, and you
can later connect a custom domain (e.g. ladiesleadershiplogistics.com).

EDITING LINKS OR TEXT
-----------------------
- Episode links: open index.html, search for "data-link" inside the
  <section id="episodes"> block — swap the YouTube URLs there.
- Social links: search for "footer__social" — three links (LinkedIn,
  Instagram, YouTube).
- Any text (hero title, about copy, founder bio) is plain text inside
  index.html — edit directly, no build step needed.

TECH NOTES
-----------
Pure HTML/CSS/JS — no frameworks, no build step, works anywhere
(any static host, no Node required to run it). Fully responsive from
small phones up through large desktop screens, with a gold "route
line" scroll-progress signature on wider screens (≥1100px) that
echoes the curved line in your logo. Respects users' reduced-motion
preferences.
