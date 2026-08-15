/**
 * One-time backfill script.
 *
 * Use this when your episode images are ALREADY sitting in your GitHub repo
 * (e.g. public/58.png, public/57.png, ...) and you just want to create the
 * matching MongoDB records — without re-uploading every image through the
 * admin panel.
 *
 * It reads episodes-seed.json (edit that file first — especially the
 * spotifyLink values, see note below), confirms each image actually exists
 * in your GitHub repo (so it can grab the file's `sha`, needed later if you
 * ever delete the episode from the admin panel), and upserts one Episode
 * document per entry.
 *
 * Run it once from the project root:
 *   node seed-episodes.js
 *
 * It's safe to re-run: existing episodes (matched by imagePath) are updated
 * in place rather than duplicated.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

if (!MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}
if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing GITHUB_TOKEN, GITHUB_OWNER or GITHUB_REPO in .env — these are needed to confirm each image exists and to fetch its sha.');
  process.exit(1);
}

// Must match the Episode schema in server.js exactly.
const episodeSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 150, default: '' },
  youtubeLink: { type: String, trim: true, maxlength: 500, required: true },
  spotifyLink: { type: String, trim: true, maxlength: 500, required: true },
  imageUrl: { type: String, required: true },
  imagePath: { type: String, required: true },
  imageSha: { type: String, required: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Episode = mongoose.model('Episode', episodeSchema);

async function fetchGithubFileSha(repoPath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'lll-admin-seed'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `GitHub API error (${res.status})`);
  }
  return data.sha;
}

async function main() {
  const seedPath = path.join(__dirname, 'episodes-seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error(`Could not find ${seedPath}. Put episodes-seed.json next to this script.`);
    process.exit(1);
  }
  const entries = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB. Seeding ${entries.length} episode(s)...\n`);

  let ok = 0;
  let failed = 0;

  // entries[0] is treated as the newest / first card; order increases from there.
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { title, youtubeLink, spotifyLink, imagePath } = entry;

    if (!youtubeLink || !spotifyLink || !imagePath) {
      console.warn(`⚠️  Skipping "${title || imagePath}" — missing youtubeLink, spotifyLink or imagePath.`);
      failed++;
      continue;
    }

    try {
      const sha = await fetchGithubFileSha(imagePath);
      const imageUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${imagePath}`;

      await Episode.findOneAndUpdate(
        { imagePath },
        {
          $set: {
            title: title || '',
            youtubeLink,
            spotifyLink,
            imageUrl,
            imageSha: sha,
            order: i
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      console.log(`✅ ${title || imagePath} — ${imagePath}`);
      ok++;
    } catch (err) {
      console.error(`❌ ${title || imagePath} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} saved, ${failed} failed.`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error('Seed script crashed:', err);
  process.exit(1);
});