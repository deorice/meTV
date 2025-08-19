// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());



//-------------------TACKING DES VUES-------------------------
// server.js
const { PrismaClient } = require("@prisma/client"); // Prisma Client pour interagir avec la DB
const prisma = new PrismaClient();


// Suivi de la vue
app.post("/api/track-view", async (req, res) => {
  const { userId, contentId, duration } = req.body;

  // Vérifier si toutes les données nécessaires sont présentes
  if (!userId || !contentId || !duration) {
    return res.status(400).json({ error: "Données manquantes" });
  }

  try {
    // Enregistrer la vue dans la base de données avec Prisma
    const view = await prisma.view.create({
      data: {
        userId,          // Identifiant de l'utilisateur
        contentId,       // Identifiant du contenu
        duration,        // Durée de la vue
        timestamp: new Date(), // Timestamp pour la vue
      },
    });

    return res.json({ message: "Vue suivie avec succès", view });  // Réponse réussie
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la vue : ", error);
    return res.status(500).json({ error: "Erreur du serveur" });  // Gestion des erreurs serveur
  }
});


//-----------------------TRACKING STATS-----------------------
// Endpoint pour récupérer les statistiques
app.get("/api/stats", async (req, res) => {
  try {
    // Nombre total de vues
    const totalViews = await prisma.view.count();

    // Durée moyenne des vues
    const avgDuration = await prisma.view.aggregate({
      _avg: {
        duration: true, // Calcul de la durée moyenne
      },
    });

    // Retourner les statistiques
    res.json({
      totalViews,  // Nombre total de vues
      avgDuration: avgDuration._avg.duration, // Durée moyenne
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques : ", error);
    res.status(500).json({ error: "Erreur lors de la récupération des statistiques." });
  }
});

// Récupération des stats côté frontend AdminDashboard.tsx
const fetchStats = async () => {
  const response = await fetch("http://localhost:4000/api/stats");  // Utilise l'URL complète
  if (!response.ok) {
    throw new Error("Impossible de récupérer les stats.");
  }
  const stats = await response.json();
  return stats;
};


fetchStats();




// --------- Persistance simple (fichier data.json) ----------
const DATA_FILE = path.join(__dirname, "data.json");
const DEFAULT_STREAM =
  "https://terranoweb.duckdns.org/live/MoiEgliseTV/index.m3u8";

function loadConfig() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.currentStreamUrl === "string") {
      return parsed;
    }
  } catch (_) {}
  return { currentStreamUrl: DEFAULT_STREAM };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cfg, null, 2), "utf8");
  } catch (e) {
    console.error("❌ Impossible d'écrire data.json :", e.message);
  }
}

let { currentStreamUrl } = loadConfig();


// ----------------------DAILY STATS------------------------

// Stats agrégées par jour (SQLite via requête brute)
app.get("/api/stats/daily", async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days || 7)));
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT
        strftime('%Y-%m-%d', timestamp) AS day,
        COUNT(*) AS views,
        AVG(duration) AS avgDuration
      FROM View
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY day
      ORDER BY day ASC
      `,
      days
    );
    res.json({ days, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur stats/daily" });
  }
});





// -----------------------------------------------------------

// 🔒 Mini token admin (à remplacer dès que possible)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-very-soon";

// 1) Endpoint public : donne le lien m3u8 courant
app.get("/stream", (req, res) => {
  res.json({ url: currentStreamUrl });
});

// 2) Endpoint admin : met à jour le lien m3u8
app.post("/admin/stream", (req, res) => {
  const token = req.header("x-admin-token");

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { url } = req.body;
  console.log("URL reçue pour mise à jour :", url); // Ajouter un log pour afficher l'URL

  if (!url || !url.endsWith(".m3u8")) {
    return res.status(400).json({ error: "URL m3u8 invalide" });
  }

  currentStreamUrl = url.trim();
  saveConfig({ currentStreamUrl });

  console.log("Flux actuel mis à jour avec l'URL :", currentStreamUrl); // Log de confirmation
  return res.json({ ok: true, url: currentStreamUrl });
});


// 3) Page Admin (UI propre + prévisualisation HLS avec hls.js)
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>meTV — Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>
</head>
<body class="bg-gray-950 text-white min-h-screen">
  <div class="max-w-4xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">meTV — Admin</h1>
    <p class="text-gray-400">Insérez un lien <code>.m3u8</code>, testez-le, puis enregistrez. Les statistiques en temps réel et historiques s’affichent ci-dessous.</p>

    <!-- Bloc config -->
    <div class="space-y-4 bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <label class="block text-sm text-gray-300">Lien .m3u8</label>
      <input id="url" type="text" class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 outline-none" placeholder="https://.../stream.m3u8"/>

      <label class="block text-sm text-gray-300 mt-2">Admin token</label>
      <input id="token" type="password" class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 outline-none" placeholder="Votre token admin"/>

      <div class="flex flex-wrap gap-3 mt-2">
        <button id="btnUseCurrent" class="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600">Utiliser le flux actuel</button>
        <button id="btnPreview" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">🔎 Prévisualiser</button>
        <button id="btnSave" class="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500">💾 Enregistrer</button>
      </div>

      <p id="current" class="text-sm text-gray-400 mt-2">Flux actuel : <span class="font-mono">chargement...</span></p>
      <p id="msg" class="text-sm mt-1"></p>
    </div>

    <!-- Prévisualisation -->
    <div class="bg-black rounded-2xl overflow-hidden border border-gray-800">
      <div class="aspect-video bg-gray-900 flex items-center justify-center">
        <video id="video" controls class="w-full h-full"></video>
      </div>
    </div>

    <!-- STATISTIQUES -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Statistiques</h2>

      <!-- Cartes temps réel -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p class="text-gray-400 text-sm">Vues totales</p>
          <p id="statTotal" class="text-2xl font-bold mt-1">0</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p class="text-gray-400 text-sm">Durée moyenne (s)</p>
          <p id="statAvg" class="text-2xl font-bold mt-1">0</p>
        </div>
      </div>

      <!-- Courbe (7 jours) -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p class="text-gray-400 mb-2">Vues par jour (7 derniers jours)</p>
        <canvas id="dailyChart" height="120"></canvas>
      </div>
    </section>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const msg = (text, ok=false) => {
    const el = $("msg");
    el.textContent = text || "";
    el.className = "text-sm mt-1 " + (ok ? "text-green-400" : "text-red-400");
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
      hls.on(Hls.Events.ERROR, () => msg("Erreur de prévisualisation (CORS ou flux invalide)."));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else {
      msg("Votre navigateur ne supporte pas HLS. Essayez Safari.");
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

  // ====== Stats temps réel + daily ======
  let dailyChart;
  async function refreshRealtime() {
    try {
      const r = await fetch("/api/stats");
      const j = await r.json();
      $("statTotal").textContent = j.totalViews ?? 0;
      $("statAvg").textContent = Math.round(j.avgDuration ?? 0);
    } catch {}
  }

  async function refreshDaily() {
    try {
      const r = await fetch("/api/stats/daily?days=7");
      const j = await r.json();
      const labels = (j.rows || []).map(x => x.day);
      const data = (j.rows || []).map(x => Number(x.views) || 0);

      const ctx = $("dailyChart").getContext("2d");
      if (!dailyChart) {
        dailyChart = new Chart(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [{
              label: "Vues",
              data,
              tension: 0.3,
            }]
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
          }
        });
      } else {
        dailyChart.data.labels = labels;
        dailyChart.data.datasets[0].data = data;
        dailyChart.update();
      }
    } catch {}
  }

  // init + polling
  fetchCurrent();
  refreshRealtime();
  refreshDaily();
  setInterval(refreshRealtime, 5000);
  setInterval(refreshDaily, 15000);
</script>
</body>
</html>
  `);
});


// Démarrer le serveur
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ meTV backend en marche sur http://localhost:${PORT}`);
  console.log(`🔐 Admin token actuel: ${ADMIN_TOKEN === "change-me-very-soon" ? "(par défaut) change-me-very-soon" : "(défini via ADMIN_TOKEN)"}`);
});
