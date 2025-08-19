// frontend/src/utils/api.ts

export const fetchStats = async () => {
  const response = await fetch("http://localhost:4000/api/stats"); // Changez l'URL si vous déployez sur un autre serveur
  const data = await response.json();
  return data;
};
