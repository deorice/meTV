import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import { LineChart } from "react-native-chart-kit"; // Importation du graphique
import { Dimensions } from "react-native";

// Fonction pour récupérer les statistiques
const fetchStats = async () => {
  try {
    const res = await fetch("http://localhost:4000/api/stats");
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques", error);
    return { totalViews: 0, avgDuration: 0 }; // Valeur par défaut en cas d'erreur
  }
};

// Fonction pour récupérer les statistiques journalières (7 derniers jours)
const fetchDailyStats = async () => {
  try {
    const res = await fetch("http://localhost:4000/api/stats/daily?days=7");
    const data = await res.json();
    return data.rows; // Retourne les données de vues par jour
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques journalières", error);
    return []; // Retourne un tableau vide en cas d'erreur
  }
};

const screenWidth = Dimensions.get("window").width; // Largeur de l'écran

const AdminDashboard = () => {
  const [stats, setStats] = useState({ totalViews: 0, avgDuration: 0 });
  const [dailyStats, setDailyStats] = useState([]);
  const [url, setUrl] = useState(""); // État pour stocker l'URL du flux actuel
  const [error, setError] = useState(null); // Pour gérer les erreurs

  // Récupérer les statistiques de vues et journalières
  useEffect(() => {
    const fetchData = async () => {
      const result = await fetchStats(); // Fonction pour récupérer les stats
      setStats(result); // Mettre à jour les stats principales
      const dailyData = await fetchDailyStats(); // Récupérer les données des vues journalières
      setDailyStats(dailyData || []); // Stocker les données des vues par jour
    };

    fetchData();
    
    // Rafraîchissement automatique toutes les 30 secondes pour les vues
    const intervalId = setInterval(fetchData, 30000);
    return () => clearInterval(intervalId); // Nettoyage du timer lors du démontage
  }, []);

  // Fonction pour récupérer le flux actuel
  const fetchCurrent = async () => {
    try {
      const response = await fetch("http://localhost:4000/stream"); // Mettre ici l'URL de ton serveur
      const data = await response.json();
      setUrl(data.url);
    } catch (error) {
      setError("Erreur : Impossible de récupérer le flux actuel");
    }
  };

  // Fonction pour jouer la prévisualisation du flux
  const playPreview = async (url: string) => {
    // Logique de prévisualisation avec l'URL m3u8
    console.log("Prévisualisation du flux :", url);
    // Logique pour afficher la vidéo ou effectuer une action selon l'URL
  };

  // Préparer les données du graphique pour les vues par jour
  const data = {
    labels: dailyStats.map((stat) => stat.day), // X-Axis (dates)
    datasets: [
      {
        label: "Vues par jour",
        data: dailyStats.map((stat) => stat.views), // Y-Axis (nombre de vues)
        borderColor: "rgba(75,192,192,1)",
        fill: false,
      },
    ],
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Tableau de bord administrateur</Text>

      <View style={styles.stats}>
        <Text>Total des vues : {stats.totalViews}</Text>
        <Text>Durée moyenne : {stats.avgDuration} secondes</Text>
      </View>

      <View style={styles.controls}>
        {/* Bouton pour utiliser le flux actuel */}
        <Button
          title="Utiliser le flux actuel"
          onPress={fetchCurrent}  // Appel de fetchCurrent() pour récupérer l'URL actuelle
        />
        <Text>Flux actuel : {url}</Text>  {/* Affichage de l'URL du flux actuel */}

        {/* Bouton pour prévisualiser le flux */}
        <Button
          title="Prévisualiser"
          onPress={() => playPreview(url)}  // Prévisualisation du flux
          disabled={!url}  // Désactive le bouton si l'URL est vide
        />
      </View>

      <View style={styles.chartContainer}>
        <Text>Graphique des vues par jour (7 derniers jours)</Text>
        <LineChart
          data={data}
          width={screenWidth - 16} // Largeur du graphique
          height={220}
          chartConfig={{
            backgroundColor: "#1E2923",
            backgroundGradientFrom: "#08130D",
            backgroundGradientTo: "#1E2923",
            decimalPlaces: 2, // Nombre de décimales
            color: (opacity = 1) => `rgba(26, 255, 146, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            style: {
              borderRadius: 16,
            },
            propsForDots: {
              r: "6",
              strokeWidth: "2",
              stroke: "#ffa726",
            },
          }}
          bezier
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  stats: {
    marginBottom: 20,
  },
  controls: {
    marginBottom: 20,
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
});

export default AdminDashboard;
