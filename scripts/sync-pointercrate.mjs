
import fs from "node:fs/promises";

const API = "https://pointercrate.com/api/v2/demons/listed/";
const out = new URL("../data/levels.json", import.meta.url);
const mf = new URL("../data/manifest.json", import.meta.url);

const norm = s =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const pname = x =>
  typeof x === "string"
    ? x
    : x?.name || x?.display_name || "";

const read = async (url, fallback) => {
  try {
    return JSON.parse(await fs.readFile(url, "utf8"));
  } catch {
    return fallback;
  }
};

const old = await read(out, { levels: [] });
const manifest = await read(mf, {});
const previous = old.levels || [];

try {
  const raw = [];
  let after = null;

  while (raw.length < 150) {
    const url = new URL(API);

    url.searchParams.set("limit", "100");

    if (after !== null) {
      url.searchParams.set("after", String(after));
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DASHSPOT fan project"
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      throw Error(`HTTP ${response.status}`);
    }

    const page = await response.json();

    if (!Array.isArray(page)) {
      throw Error("Unexpected API response");
    }

    if (!page.length) break;

    raw.push(...page);

    after = page[page.length - 1].position;

    if (page.length < 100 || Number(after) >= 150) {
      break;
    }
  }

  const ids = new Map(
    previous.map(x => [String(x.id), x])
  );

  const names = new Map(
    previous.map(x => [norm(x.name), x])
  );

  const levels = raw
    .filter(x =>
      Number(x.position) >= 1 &&
      Number(x.position) <= 150
    )
    .sort((a, b) => a.position - b.position)
    .slice(0, 150)
    .map(x => {
      const prior =
        ids.get(String(x.id)) ||
        names.get(norm(x.name)) ||
        {};

      const asset =
        manifest[String(x.id)] ||
        manifest[String(x.level_id)] ||
        manifest[norm(x.name)] ||
        {};

      const audioUrl =
        asset.audioUrl ||
        asset.audio ||
        prior.audioUrl ||
        prior.song?.url ||
        "";

      const imageUrl =
        asset.imageUrl ||
        asset.image ||
        prior.imageUrl ||
        "";

      return {
        id: x.id,
        level_id: x.level_id ?? null,
        name: x.name,
        position: Number(x.position),

        verifier: pname(x.verifier),
        publisher: pname(x.publisher),

        creators: Array.isArray(x.creators)
          ? x.creators.map(pname).filter(Boolean)
          : (prior.creators || []),

        video: x.video || prior.video || "",
        thumbnail: x.thumbnail || prior.thumbnail || "",

        // Audio compatibility
        audioUrl,

        song: {
          ...(prior.song || {}),
          url: audioUrl
        },

        imageUrl
      };
    });

  if (!levels.length) {
    throw Error("Empty ranking response; refusing to overwrite database");
  }

  await fs.writeFile(
    out,
    JSON.stringify({
      updated_at: new Date().toISOString(),
      source: API,
      count: levels.length,
      levels
    }, null, 2) + "\n"
  );

  console.log(`Synced ${levels.length} levels.`);

} catch (error) {
  console.error("Pointercrate sync failed:", error.message);

  if (previous.length) {
    console.log(
      `Keeping previous ${previous.length}-level database.`
    );
    process.exit(0);
  }

  process.exit(1);
}
