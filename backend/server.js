// server.js (version simplifiée Render, sans Prisma/statistiques)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// —— Persistance via data.json sur disque (Render mount) ——
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
const DATA_FILE = path.join(DATA_DIR, "data.json");
const DEFAULT_STREAM = "https://terranoweb.duckdns.org/live/MoiEgliseTV/index.m3u8";

function loadConfig() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.currentStreamUrl === "string") return parsed;
  } catch (_) {}
  return { currentStreamUrl: DEFAULT_STREAM };
}
function saveConfig(cfg) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(cfg, null, 2), "utf8"); }
  catch (e) { console.error("❌ Impossible d'écrire data.json :", e.message); }
}
let { currentStreamUrl } = loadConfig();

// —— Sécurité admin ——
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-very-soon";

// —— Healthcheck (pour Render) ——
app.get("/health", (req, res) => {
  res.json({ ok: true, stream: !!currentStreamUrl });
});

// —— API publique : flux courant ——
app.get("/stream", (req, res) => {
  res.json({ url: currentStreamUrl });
});

// —— API admin : mettre à jour le lien m3u8 ——
app.post("/admin/stream", (req, res) => {
  const token = req.header("x-admin-token");
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });

  const { url } = req.body || {};
  if (!url || !url.endsWith(".m3u8")) return res.status(400).json({ error: "URL m3u8 invalide" });

  currentStreamUrl = url.trim();
  saveConfig({ currentStreamUrl });
  return res.json({ ok: true, url: currentStreamUrl });
});

// —— Page Admin (UI légère : utiliser flux / prévisualiser / enregistrer) ——
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>meTV — Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body class="bg-gray-950 text-white min-h-screen">
  <div class="max-w-3xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">meTV — Admin</h1>
    <p class="text-gray-400">Entrez un lien <code>.m3u8</code>, testez-le, puis enregistrez.</p>

    <div class="space-y-4 bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <label class="block text-sm text-gray-300">Lien .m3u8</label>
      <input id="url" type="text" class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 outline-none"
             placeholder="https://.../stream.m3u8"/>

      <label class="block text-sm text-gray-300">Admin token</label>
      <input id="token" type="password" class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 outline-none"
             placeholder="Votre token admin"/>

      <div class="flex flex-wrap gap-3">
        <button id="btnUseCurrent" class="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600">Utiliser le flux actuel</button>
        <button id="btnPreview" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">🔎 Prévisualiser</button>
        <button id="btnSave" class="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500">💾 Enregistrer</button>
      </div>

      <p id="current" class="text-sm text-gray-400">Flux actuel : <span class="font-mono">chargement...</span></p>
      <p id="msg" class="text-sm"></p>
    </div>

    <div class="bg-black rounded-2xl overflow-hidden border border-gray-800">
      <div class="aspect-video bg-gray-900 flex items-center justify-center">
        <video id="video" controls class="w-full h-full"></video>
      </div>
    </div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const msg = (text, ok=false) => {
    const el = $("msg");
    el.textContent = text || "";
    el.className = "text-sm " + (ok ? "text-green-400" : "text-red-400");
  };

  async function fetchCurrent() {
    const r = await fetch("/stream");
    const j = await r.json();
    $("current").innerHTML = "Flux actuel : <span class=\\"font-mono\\">" + j.url + "</span>";
    return j.url;
  }

  function playPreview(url) {
    const video = $("video");
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, () => msg("Erreur de prévisualisation (CORS/flux invalide)."));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else {
      msg("Votre navigateur ne supporte pas HLS (essayez Safari).");
    }
    video.play().catch(()=>{});
  }

  $("btnUseCurrent").addEventListener("click", async () => {
    const url = await fetchCurrent();
    $("url").value = url || "";
    msg("");
  });

  $("btnPreview").addEventListener("click", async () => {
    const url = $("url").value.trim();
    if (!url.endsWith(".m3u8")) return msg("Entrez une URL .m3u8 valide");
    msg("");
    playPreview(url);
  });

  $("btnSave").addEventListener("click", async () => {
    const url = $("url").value.trim();
    const token = $("token").value.trim();
    if (!url.endsWith(".m3u8")) return msg("Entrez une URL .m3u8 valide");

    const r = await fetch("/admin/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ url })
    });
    const j = await r.json();
    if (r.ok) {
      msg("Lien enregistré ✅", true);
      $("url").value = "";
      await fetchCurrent();
    } else {
      msg("Erreur: " + (j.error || "inconnue"));
    }
  });

  // Init
  fetchCurrent();
</script>
</body>
</html>`);
});

// —— Démarrage ——
// IMPORTANT: Render injecte PORT. N’utilise pas un port fixe.
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ meTV backend en marche sur port ${PORT}`);
  console.log(`🔐 Admin token: ${ADMIN_TOKEN === "change-me-very-soon" ? "(par défaut) change-me-very-soon" : "(défini via ADMIN_TOKEN)"}`);
});
