

// Obstacle hinzufügen
function update_obstacles() {
    const url = 'https://gta-project-six.vercel.app/update_obstacles?position=' + position
    fetch(url)
        .then(response => response.json())
            .then(json => {
                console.log(json);
            })
}

// Navigation starten
function start_navigation() {
    const url = 'https://gta-project-six.vercel.app/start_navigation?start_pos=' + start_pos + '&max_grad=' + max_grad + '&dest=' + dest
}