const paths = [
  "gh/harrisrehman/App@cursor%2Fannex-android-a9d2/dist/version.json",
  "gh/harrisrehman/App@cursor%2Fannex-android-a9d2/dist/annex.html",
  "gh/harrisrehman/App@cursor/annex-android-a9d2/dist/version.json",
  "gh/harrisrehman/App@cursor/annex-android-a9d2/dist/annex.html",
];

for (const path of paths) {
  const res = await fetch(`https://purge.jsdelivr.net/${path}`);
  console.log(path, res.status, await res.text());
}
