// Initialisiere die Karte und setze den Fokus auf Zürich
const map = L.map('map').setView([47.3769, 8.5417], 13);

// Füge OpenStreetMap-Tiles hinzu
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Icons definieren
const accessibleIcon = L.icon({
  iconUrl: 'accessible_icon.svg',  // Icon für barrierefreie Standorte (grünes Rollstuhl-Symbol)
  iconSize: [15, 15]
});

const obstacleIcon = L.icon({
  iconUrl: 'obstacle_icon.svg',  // Icon für Hindernisse (rotes Warnzeichen)
  iconSize: [15, 15]
});

// Laden der ZüriACT GeoJSON-Daten
fetch('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/ZueriACT_barrierefreie_Mobilitaet?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=zueriact_daten_aufbereitet')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        // Prüfe, ob der Punkt die Mobilität erleichtert oder erschwert
        const isAccessible = feature.properties.isAccessible; // Beispiel: Attribut anpassen
        const icon = isAccessible ? accessibleIcon : obstacleIcon;

        // Erstelle einen Marker mit dem passenden Icon
        return L.marker(latlng, { icon: icon }).bindPopup(
          isAccessible ? "Barrierefreier Standort" : "Hindernis"
        );
      }
    }).addTo(map);
  })
  .catch(error => console.error('Fehler beim Laden der ZüriACT GeoJSON-Daten:', error));

// Event-Listener für Filteroptionen
document.getElementById('ramps').addEventListener('change', updateRoute);
document.getElementById('avoid-stairs').addEventListener('change', updateRoute);

// Funktion zum Aktualisieren der Route basierend auf den Filtern
function updateRoute() {
  const rampsOnly = document.getElementById('ramps').checked;
  const avoidStairs = document.getElementById('avoid-stairs').checked;
  
  // Beispiel: Filter für die Route anwenden
  console.log(`Routenfilter: Nur Rampen=${rampsOnly}, Treppen vermeiden=${avoidStairs}`);
  // Weitere Logik zur Routenanpassung hier implementieren
}

// Beispiel für Echtzeit-Daten (hier nur als Simulation)
let distance = 0;
let speed = 0;

// Simuliere Echtzeit-Datenaktualisierung
function updateInfo() {
  distance += Math.random() * 5; // Zufällige Erhöhung der Distanz
  speed = Math.random() * 10; // Zufällige Geschwindigkeit
  
  document.getElementById('distance').textContent = distance.toFixed(2);
  document.getElementById('speed').textContent = speed.toFixed(2);
}

setInterval(updateInfo, 1000); // Aktualisiere jede Sekunde

// Datenquellen für Echtzeit-Daten hinzufügen
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(position => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    // Nutzerposition anzeigen
    L.marker([lat, lon]).addTo(map).bindPopup("Deine Position").openPopup();
    
    // Karte zur Nutzerposition zentrieren
    map.setView([lat, lon], 15);
  }, error => {
    console.error("Fehler bei der Standortabfrage:", error);
  });
} else {
  alert("Geolocation wird von diesem Browser nicht unterstützt.");
}

// Erweiterung der Filterlogik für barrierefreie Wege
function updateRoute() {
  const rampsOnly = document.getElementById('ramps').checked;
  const avoidStairs = document.getElementById('avoid-stairs').checked;
  
  // Beispieldaten für Rampen und Treppen - in der Praxis von Geoserver abfragen
  const accessiblePaths = [
    { lat: 47.3769, lon: 8.5417, type: 'ramp' },
    { lat: 47.3765, lon: 8.5398, type: 'stairs' }
  ];
  
  accessiblePaths.forEach(path => {
    if ((rampsOnly && path.type === 'ramp') || (!avoidStairs && path.type === 'stairs')) {
      L.marker([path.lat, path.lon]).addTo(map).bindPopup(`Zugang: ${path.type}`);
    }
  });
}
