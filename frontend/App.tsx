import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { Video, ResizeMode, Audio } from "expo-av";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";

// ⬇️ Mets TON IP locale ou ton domaine backend ici
const API_BASE = "https://metv-backend.onrender.com";

export default function App() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const videoRef = useRef<Video>(null);

  // Lecture même si l’iPhone est en mode silencieux
  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          shouldDuckAndroid: true,
        });
      } catch {}
    })();
  }, []);

  // Récupération du flux (et rafraîchissement toutes les 30s)
  const fetchStreamUrl = async () => {
    try {
      const r = await fetch(`${API_BASE}/stream`);
      const j = await r.json();
      setStreamUrl(j.url || null);
      setError(null);
    } catch {
      setError("Impossible de récupérer le flux. Vérifie l’IP/serveur.");
    }
  };
  useEffect(() => {
    fetchStreamUrl();
    const id = setInterval(fetchStreamUrl, 30000);
    return () => clearInterval(id);
  }, []);





  useEffect(() => {
  if (!streamUrl) return;
  let timer = null;

  const sendPing = async () => {
    try {
      await fetch(`${API_BASE}/api/track-view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "anonymous",      // on mettra un vrai ID plus tard
          contentId: "live",        // ou l’ID de la chaîne/contenu
          duration: 15              // ping de 15s de visionnage
        })
      });
    } catch {}
  };

  // envoie un ping toutes les 15s pendant la lecture
  timer = setInterval(() => {
    if (isPlaying) sendPing();
  }, 15000);

  return () => { if (timer) clearInterval(timer); };
}, [streamUrl, isPlaying]);






  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    const st = await v.getStatusAsync();
    if (!st.isLoaded) return;
    if (st.isPlaying) {
      await v.pauseAsync();
      setIsPlaying(false);
    } else {
      await v.playAsync();
      setIsPlaying(true);
    }
  };

  const enterFullscreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    setIsFullscreen(true);
  };
  const exitFullscreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    setIsFullscreen(false);
  };

  const toggleControls = () => setShowControls((s) => !s);

  return (
    <SafeAreaView style={[styles.container, isFullscreen && styles.containerFull]}>
      <StatusBar style="light" hidden={isFullscreen} />
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={[styles.playerBox, isFullscreen && styles.playerBoxFull]}>
          {!isReady && <ActivityIndicator size="large" />}
          {error && <Text style={styles.error}>{error}</Text>}
          {streamUrl && (
            <Video
              ref={videoRef}
              source={{ uri: streamUrl }}
              style={isFullscreen ? styles.videoFull : styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              useNativeControls={false}
              onError={() =>
                setError("Erreur de lecture HLS (lien .m3u8 invalide ou indisponible).")
              }
              onPlaybackStatusUpdate={(status) => {
                if ("isPlaying" in status) setIsPlaying(!!status.isPlaying);
                if (status.isLoaded) setIsReady(true);
              }}
            />
          )}
        </View>
      </TouchableWithoutFeedback>

      {showControls && (
        <View style={[styles.controls, isFullscreen && styles.controlsFull]}>
          <TouchableOpacity style={styles.button} onPress={togglePlay} disabled={!streamUrl}>
            <Text style={styles.buttonText}>{isPlaying ? "⏸ Pause" : "▶️ Play"}</Text>
          </TouchableOpacity>

          {!isFullscreen ? (
            <TouchableOpacity style={styles.button} onPress={enterFullscreen} disabled={!streamUrl}>
              <Text style={styles.buttonText}>⤢ Plein écran</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.button} onPress={exitFullscreen}>
              <Text style={styles.buttonText}>⤡ Quitter</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 12 },
  containerFull: { padding: 0 },
  playerBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    overflow: "hidden",
  },
  playerBoxFull: { width: "100%", height: "100%", aspectRatio: undefined, borderRadius: 0 },
  video: { width: "100%", height: "100%" },
  videoFull: { width: "100%", height: "100%" },
  controls: { flexDirection: "row", gap: 12, marginTop: 16 },
  controlsFull: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  button: { backgroundColor: "#1f2937", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 },
  buttonText: { color: "#fff", fontSize: 16 },
  error: { color: "#ff6b6b", textAlign: "center", padding: 8 },
});
