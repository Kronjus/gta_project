// Initialisiere die Karte und setze den Fokus auf Zürich
const map = L.map('map').setView([47.3769, 8.5417], 13);

// Füge OpenStreetMap-Tiles hinzu
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);


// Benutzerdefiniertes Icon laden
const obstacleIcon = L.icon({
    iconUrl: "./static/obstacle_icon.svg", // Icon-Pfad im selben Verzeichnis
    iconSize: [25, 25],          // Größe des Icons
    iconAnchor: [12, 12]         // Position des Ankers
});

document.getElementById('navigation-button').addEventListener('click', () => {
    const checkbox = document.getElementById('accessibility-switch');
    if (checkbox.checked) {
        console.log('TBI: Implement restricted navigation');
    } else {
        getLocations();
    }
});

// Uneingeschränkte Navigation


// Hole aktuelle Position und Zielort
function getLocations() {
    console.log('Getting current location and destination...');
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();
    console.log('Destination:', destination);

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const startLat = position.coords.latitude;
                const startLon = position.coords.longitude;
                console.log('Current location coordinates:', startLat, startLon);

                // Geocode the destination to get its coordinates
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;
                console.log('Geocode URL:', geocodeUrl);

                fetch(geocodeUrl)
                    .then(response => response.json())
                    .then(data => {
                        if (data.length > 0) {
                            const endLat = data[0].lat;
                            const endLon = data[0].lon;
                            console.log('Destination coordinates:', endLat, endLon);
                            fetch('/shortest-path', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    start_lat: startLat,
                                    start_lon: startLon,
                                    end_lat: endLat,
                                    end_lon: endLon,
                                }),
                            })
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error('Network response was not ok');
                                    }
                                    return response.json();
                                })
                                .then(data => {
                                    if (data.error) {
                                        console.error('Error fetching shortest path:', data.error);
                                        alert('Error fetching shortest path: ' + data.error);
                                        return;
                                    }

                                    const path = data.path;
                                    if (!Array.isArray(path) || path.length === 0) {
                                        throw new Error('Invalid path data');
                                    }

                                    // Use the path data to create a polyline on the map
                                    const latlngs = path.map(node => [node.lat, node.lon]);
                                    const polyline = L.polyline(latlngs, {color: 'blue'}).addTo(map);
                                })
                                .catch(error => {
                                    console.error('Error fetching shortest path:', error);
                                    alert('Error fetching shortest path: ' + error.message);
                                });
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching geocode data:", error);
                        alert("There was a problem searching for the destination.");
                    });
            },
            (error) => {
                console.error('Error getting current location:', error.message);
            },
            {
                enableHighAccuracy: false,
                maximumAge: 0,
                timeout: Infinity, // Set a timeout of 5 seconds
            }
        );
    } else {
        console.warn('Geolocation is not supported by this browser.');
    }
}

// Zeige Route auf Karte an
function displayPathOnMap(path) {
    if (!path) {
        alert("No path found.");
        return;
    }

    // Clear existing path if any
    if (window.currentPathLayer) {
        map.removeLayer(window.currentPathLayer);
    }

    // Convert path to LatLng coordinates
    const latLngs = path.map(node => [node.lat, node.lon]);

    // Create a polyline and add it to the map
    window.currentPathLayer = L.polyline(latLngs, {color: 'blue'}).addTo(map);

    // Fit the map to the polyline bounds
    map.fitBounds(window.currentPathLayer.getBounds());
}

// Menü-Interaktion sicherstellen
const menuToggle = document.getElementById('menu-toggle');
const sideMenu = document.getElementById('side-menu');
const closeMenu = document.getElementById('close-menu');

menuToggle.addEventListener('click', () => {
    sideMenu.style.width = "250px";
});

closeMenu.addEventListener('click', () => {
    sideMenu.style.width = "0";
});

// Suchleiste - Zielort eingeben
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');

searchBtn.addEventListener('click', (event) => {
    const destination = searchInput.value.trim();
    if (destination) {
        findLocation(destination);
    } else {
        alert("Bitte gib einen Zielort ein.");
    }
});

// Add event listener for the Enter key press in the search input field
searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default action
        const destination = searchInput.value.trim();
        if (destination) {
            findLocation(destination);
        } else {
            alert("Bitte gib einen Zielort ein.");
        }
    }
});
// Add event listener to the search input field
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query.length > 2) { // Fetch suggestions if input length is greater than 2
        fetchSuggestions(query);
    } else {
        clearSuggestions();
    }
});

// Fetch location suggestions from the Nominatim API
function fetchSuggestions(query) {
    const zurichViewbox = '8.455,47.323,8.617,47.434'; // Bounding box for Zurich (minLon, minLat, maxLon, maxLat)
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&viewbox=${zurichViewbox}&bounded=1`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            displaySuggestions(data);
        })
        .catch(error => {
            console.error("Error fetching location suggestions:", error);
        });
}

// Display the suggestions in a dropdown list
function displaySuggestions(suggestions) {
    clearSuggestions();
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'suggestions-container';
    suggestionsContainer.style.position = 'absolute';
    suggestionsContainer.style.backgroundColor = 'white';
    suggestionsContainer.style.border = '1px solid #ccc';
    suggestionsContainer.style.zIndex = '1000';

    // Get the height of the search bar and set the top property
    const searchBarHeight = searchInput.offsetHeight;
    suggestionsContainer.style.top = `${searchBarHeight}px`;

    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        suggestionItem.style.padding = '8px';
        suggestionItem.style.cursor = 'pointer';
        suggestionItem.textContent = suggestion.display_name;
        suggestionItem.addEventListener('click', () => {
            searchInput.value = suggestion.display_name;
            clearSuggestions();
        });
        suggestionsContainer.appendChild(suggestionItem);
    });

    searchInput.parentNode.appendChild(suggestionsContainer);
}

// Clear the suggestions dropdown
function clearSuggestions() {
    const existingContainer = document.getElementById('suggestions-container');
    if (existingContainer) {
        existingContainer.remove();
    }
}

let currentMarker = null; // Store the current marker

function findLocation(location) {
    // Geocoding-API verwenden, um den Ort zu suchen (z. B. Nominatim OpenStreetMap API)
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = data[0].lat;
                const lon = data[0].lon;

                // Setze die Karte auf die gefundene Position
                map.setView([lat, lon], 15);

                // Entferne den vorherigen Marker, falls vorhanden
                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }

                // Markiere den Zielort
                currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(`Ziel: ${location}`).openPopup();
            } else {
                alert("Ort nicht gefunden. Bitte überprüfe deine Eingabe.");
            }
        })
        .catch(error => {
            console.error("Fehler beim Abrufen der Geodaten:", error);
            alert("Es gab ein Problem bei der Suche nach dem Zielort.");
        });
}


// Erstelle eine MarkerClusterGroup mit angepassten Cluster-Icons
const markers = L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: function (cluster) {
        // Benutzerdefiniertes Cluster-Icon
        return L.divIcon({
            html: `
        <img src="./static/obstacle_icon.svg" style="width: 30px; height: 30px;" />
        <span style="position: absolute; top: 5px; left: 5px; color: white; font-size: 14px;">${cluster.getChildCount()}</span>
      `,
            className: 'custom-cluster-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    }
});

// Lade die ZueriACT GeoJSON-Daten
fetch('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/ZueriACT_barrierefreie_Mobilitaet?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=zueriact_daten_aufbereitet')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                // Benutze dein benutzerdefiniertes Icon für einzelne Marker
                return L.marker(latlng, {
                    icon: L.icon({
                        iconUrl: "./static/obstacle_icon.svg", // Pfad zu deinem SVG
                        iconSize: [25, 25],
                        iconAnchor: [12, 12]
                    })
                });
            }
        }).addTo(markers);
    })
    .catch(error => console.error('Fehler beim Laden der ZueriACT GeoJSON-Daten:', error));

// Füge den Cluster-Layer zur Karte hinzu
map.addLayer(markers);


//setInterval(updateInfo, 1000); // Aktualisiere jede Sekunde

// Benutzerdefiniertes ausgefülltes Standort-Icon
const locationIcon = L.divIcon({
    className: 'custom-location-icon',
    html: `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#007bff" stroke="#007bff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a9 9 0 0 1 9 9c0 5.25-9 11-9 11S3 16.25 3 11a9 9 0 0 1 9-9z"></path>
      <circle cx="12" cy="11" r="3" fill="white"></circle>
    </svg>
  `,
    iconSize: [30, 30],
    iconAnchor: [15, 30], // Ankerpunkt am unteren Ende des Symbols
});

// Geolocation aktivieren und Standort tracken
if ("geolocation" in navigator) {
    // Verfolge den Standort in Echtzeit
    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Send the current location to the server
            fetch('/save-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: 1, // Replace with actual user ID
                    lat: lat,
                    lon: lon,
                }),
            }).catch(error => {
                console.error('Error saving location:', error);
            });

            // Marker for the current location
            if (!map.currentLocationMarker) {
                map.currentLocationMarker = L.marker([lat, lon], {icon: locationIcon}).addTo(map);
                map.setView([lat, lon], 15);
            } else {
                map.currentLocationMarker.setLatLng([lat, lon]);
            }
        },
        (error) => {
            console.error('Error getting current location:', error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
        }
    );
} else {
    console.warn("Geolocation wird von diesem Browser nicht unterstützt.");
    // Handle the lack of geolocation support silently
}
