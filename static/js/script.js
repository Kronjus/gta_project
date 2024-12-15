let watchId = null;
let isNavigating = false;
let targetLat = null;
let targetLon = null;
let currentPathLayer = null; // Store the current path layer
let currentMarker = null; // Store the current marker
let currentLat = null;
let currentLon = null;
let obstaclesLayer = null; // Store the obstacles layer

// Initialize the map and set the view to Zurich
const map = L.map('map').setView([47.3769, 8.5417], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Create a MarkerClusterGroup with custom cluster icons
const markers = L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    iconCreateFunction: function (cluster) {
        // Custom cluster icon
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

// Add the markers cluster group to the map
map.addLayer(markers);

// Function to show WMS obstacles
function showWMSObstacles() {
    const wmsUrl = 'https://baug-ikg-gis-01.ethz.ch:8443/geoserver/wms';
    const wmsParams = {
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        typeName: 'obstacles', // Replace with your actual layer name
        outputFormat: 'application/json'
    };
    const url = `${wmsUrl}?${new URLSearchParams(wmsParams).toString()}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            obstaclesLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    // Use the custom icon for individual markers
                    const marker = L.marker(latlng, {
                        icon: L.icon({
                            iconUrl: "./static/obstacle_icon.svg", // Path to your SVG
                            iconSize: [25, 25],
                            iconAnchor: [12, 12]
                        })
                    });

                    // Add click event listener to the marker
                    marker.on('click', function() {
                        const properties = feature.properties;
                        const popupContent = `
                            <strong>Obstacle Information</strong><br>
                            Severity: ${properties.severity}<br>
                            Coordinates: ${latlng.lat}, ${latlng.lng}
                        `;
                        L.popup()
                            .setLatLng(latlng)
                            .setContent(popupContent)
                            .openOn(map);
                    });

                    return marker;
                }
            });
            markers.addLayer(obstaclesLayer); // Add obstacles to the markers cluster group
        })
        .catch(error => console.error('Error loading WMS GeoJSON data:', error));
}

// Function to hide WMS obstacles
function hideWMSObstacles() {
    if (obstaclesLayer) {
        markers.removeLayer(obstaclesLayer); // Remove obstacles from the markers cluster group
    }
}

// Add event listener to the "Hindernisse anzeigen" checkbox
document.getElementById('show-obstacles').addEventListener('change', (event) => {
    if (event.target.checked) {
        showWMSObstacles();
    } else {
        hideWMSObstacles();
    }
});

// Benutzerdefiniertes Icon laden
const obstacleIcon = L.icon({
    iconUrl: "./static/obstacle_icon.svg", // Icon-Pfad im selben Verzeichnis
    iconSize: [25, 25],          // Größe des Icons
    iconAnchor: [12, 12]         // Position des Ankers
});

document.getElementById('navigation-button').addEventListener('click', () => {
    getLocations();
});

// Get the modal
const modal = document.getElementById('obstacle-modal');

// Get the button that opens the modal
const obstacleBtn = document.getElementById('obstacle');

// Get the <span> element that closes the modal
const span = document.getElementsByClassName('close')[0];

// Get the submit button
const submitBtn = document.getElementById('submit-obstacle');

// When the user clicks on <span> (x), close the modal
span.onclick = function () {
    modal.style.display = 'none';
};

// When the user clicks on the button, open the modal
obstacleBtn.onclick = function () {
    modal.style.display = 'block';
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// When the user clicks on the submit button, record the obstacle
submitBtn.addEventListener('click', () => {
    const severity = document.getElementById('severity').value;
    if (severity < 1 || severity > 5) {
        alert('Bitte wähle eine Schweregrad zwischen 1 und 5 aus.');
        return;
    }
    console.log('Recording obstacle with severity:', severity);
    recordObstacle(severity);
    console.log('Obstacle recorded.');
    modal.style.display = 'none';
});

// Hindernis hinzufügen
function recordObstacle(severity) {
    console.log('Recording obstacle with severity:', severity);
    if (currentLat !== null && currentLon !== null) {
        console.log('Current location coordinates:', currentLat, currentLon);
        // Send the obstacle location to the server
        fetch('/gta_project/save-obstacle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lat: currentLat,
                lon: currentLon,
                severity: severity,
            }),
        }).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        }).then(data => {
            if (data.error) {
                console.error('Error saving obstacle:', data.error);
                alert('Error saving obstacle: ' + data.error);
            } else {
                // Add a marker for the obstacle
                L.marker([currentLat, currentLon], {icon: obstacleIcon}).addTo(map).bindPopup('Hindernis').openPopup();
            }
        }).catch(error => {
            console.error('Error saving obstacle:', error);
            alert('Error saving obstacle: ' + error.message);
        });
    } else {
        console.warn('Current location is not available.');
    }
}

// Function to calculate the distance between two coordinates in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

document.getElementById('navigation-button').addEventListener('click', () => {
    if (!isNavigating) {
        isNavigating = true;
        startNavigation();
        alert("Navigation started.");
    }
});

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (isNavigating) {
        isNavigating = false;
        stopNavigation();
        alert("Navigation stopped.");
    }
});

function startNavigation() {
    isNavigating = true;
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if (currentLat !== null && currentLon !== null) {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;

        fetch(geocodeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    targetLat = data[0].lat;
                    targetLon = data[0].lon;
                    updatePath(currentLat, currentLon, targetLat, targetLon);
                }
            })
            .catch(error => {
                console.error("Error fetching geocode data:", error);
                alert("There was a problem searching for the destination.");
            });
    } else {
        console.warn('Current location is not available.');
    }
}

function updatePath(startLat, startLon, endLat, endLon) {
    fetch('/gta_project/shortest-path', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            start_lat: startLat,
            start_lon: startLon,
            end_lat: endLat,
            end_lon: endLon,
            accessibility: document.getElementById('accessibility-switch').checked,
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
            L.polyline(latlngs, {color: 'blue'}).addTo(map);

            // Start recording the user's trajectory
            startRecordingTrajectory();
        })
        .catch(error => {
            console.error('Error fetching shortest path:', error);
            alert('Error fetching shortest path: ' + error.message);
        });
}

function startRecordingTrajectory() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                fetch('/gta_project/save-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
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

                // Check if the user has reached the destination
                if (targetLat !== null && targetLon !== null) {
                    const distanceToTarget = calculateDistance(lat, lon, targetLat, targetLon);
                    if (distanceToTarget < 5) { // Adjust the threshold as needed
                        stopNavigation(true);
                        alert("You have reached your destination.");
                    }
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
        console.warn("Geolocation is not supported by this browser.");
    }
}

function stopNavigation(reachedDestination = false) {
    isNavigating = false;
    stopRecordingTrajectory();
    // Clear the navigation line
    if (currentPathLayer) {
        map.removeLayer(currentPathLayer);
        currentPathLayer = null;
    }
    // Additional logic to handle stopping navigation, e.g., clearing the map
    if (map.currentLocationMarker) {
        map.removeLayer(map.currentLocationMarker);
        map.currentLocationMarker = null;
    }

    // Call the stop-navigation endpoint
    fetch('/gta_project/stop-navigation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            reachedDestination: reachedDestination,
            accessibility: document.getElementById('accessibility-switch').checked
        })
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    }).then(data => {
        if (data.status !== 'success') {
            console.error('Error stopping navigation:', data);
            alert('Error stopping navigation: ' + data.status);
        }
    }).catch(error => {
        console.error('Error stopping navigation:', error);
        alert('Error stopping navigation: ' + error.message);
    });
}


// Hole aktuelle Position und Zielort
function getLocations() {
    const searchInput = document.getElementById('search-input');
    const destination = searchInput.value.trim();

    if (!destination) {
        alert("Please enter a destination.");
        return;
    }

    if (currentLat !== null && currentLon !== null) {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`;

        fetch(geocodeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    targetLat = data[0].lat;
                    targetLon = data[0].lon;
                    updatePath(currentLat, currentLon, targetLat, targetLon);
                }
            })
            .catch(error => {
                console.error("Error fetching geocode data:", error);
                alert("There was a problem searching for the destination.");
            });
    } else {
        console.warn('Current location is not available.');
    }
}

function updatePath(startLat, startLon, endLat, endLon) {
    fetch('/gta_project/shortest-path', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            start_lat: startLat,
            start_lon: startLon,
            end_lat: endLat,
            end_lon: endLon,
            accessibility: document.getElementById('accessibility-switch').checked,
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

            // Clear the existing path if any
            if (currentPathLayer) {
                map.removeLayer(currentPathLayer);
            }

            // Use the path data to create a polyline on the map
            const latlngs = path.map(node => [node.lat, node.lon]);
            currentPathLayer = L.polyline(latlngs, {color: 'blue'}).addTo(map);
        })
        .catch(error => {
            console.error('Error fetching shortest path:', error);
            alert('Error fetching shortest path: ' + error.message);
        });
}

// Watch the user's position and update the path if necessary
navigator.geolocation.watchPosition(
    (position) => {
        if (isNavigating) {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;

            if (targetLat !== null && targetLon !== null) {
                const distanceToTarget = calculateDistance(currentLat, currentLon, targetLat, targetLon);
                if (distanceToTarget > 5) {
                    updatePath(currentLat, currentLon, targetLat, targetLon);
                }
            }
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

document.getElementById('stop-navigation').addEventListener('click', () => {
    if (currentPathLayer) {
        map.removeLayer(currentPathLayer);
    }
});

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


function findLocation(location) {
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = data[0].lat;
                const lon = data[0].lon;

                map.setView([lat, lon], 15);

                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }

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




// Add the markers cluster group to the map
map.addLayer(markers);

// Function to show obstacles
function showObstacles() {
    if (!obstaclesLayer) {
        // Load the ZueriACT GeoJSON data and add it to the map
        fetch('https://www.ogd.stadt-zuerich.ch/wfs/geoportal/ZueriACT_barrierefreie_Mobilitaet?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=zueriact_daten_aufbereitet')
            .then(response => response.json())
            .then(data => {
                obstaclesLayer = L.geoJSON(data, {
                    pointToLayer: function (feature, latlng) {
                        // Use the custom icon for individual markers
                        return L.marker(latlng, {
                            icon: L.icon({
                                iconUrl: "./static/obstacle_icon.svg", // Path to your SVG
                                iconSize: [25, 25],
                                iconAnchor: [12, 12]
                            })
                        });
                    }
                });
                markers.addLayer(obstaclesLayer); // Add obstacles to the markers cluster group
            })
            .catch(error => console.error('Error loading ZueriACT GeoJSON data:', error));
    } else {
        markers.addLayer(obstaclesLayer); // Add obstacles to the markers cluster group
    }
}

// Function to hide obstacles
function hideObstacles() {
    if (obstaclesLayer) {
        markers.removeLayer(obstaclesLayer); // Remove obstacles from the markers cluster group
    }
}

// Add event listener to the "Hindernisse anzeigen" checkbox
document.getElementById('show-obstacles').addEventListener('change', (event) => {
    if (event.target.checked) {
        showObstacles();
    } else {
        hideObstacles();
    }
});


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
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;

            // Send the current location to the server
            fetch('/gta_project/save-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    lat: currentLat,
                    lon: currentLon,
                }),
            })
                .then(response => response.json())
                .then(data => {
                    console.log('Location saved:', data);
                })
                .catch(error => {
                    console.error('Error saving location:', error);
                });

            // Marker for the current location
            if (!map.currentLocationMarker) {
                map.currentLocationMarker = L.marker([currentLat, currentLon], {icon: locationIcon}).addTo(map);
                map.setView([currentLat, currentLon], 15);
            } else {
                map.currentLocationMarker.setLatLng([currentLat, currentLon]);
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