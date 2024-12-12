import logging
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import os
from sqlalchemy import create_engine, text
import geopandas as gpd
import networkx as nx
import osmnx as ox
from dotenv import load_dotenv
from shapely.geometry import Point

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')


def fetch_data():
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")

    nodes_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_nodes", engine, geom_col='geometry', index_col='osmid')
    edges_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_edges", engine, geom_col='geometry',
                                 index_col=['u', 'v', 'key'])

    print("Retrieving data from database DONE!")
    return nodes_gdf, edges_gdf


def create_graph(nodes, edges):
    G = ox.graph_from_gdfs(nodes, edges)
    print("Building graph DONE!")
    print(G.graph['crs'])
    return G


def find_shortest_path(G, start_lon, start_lat, end_lon, end_lat):
    try:
        logging.debug(f"Start coordinates: ({start_lat}, {start_lon})")
        logging.debug(f"End coordinates: ({end_lat}, {end_lon})")

        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        logging.debug(f"Start node: {start_node}")

        end_node = ox.nearest_nodes(G, end_lon, end_lat)
        logging.debug(f"End node: {end_node}")

        path = ox.shortest_path(G, start_node, end_node)
        logging.debug(f"Shortest path: {path}")

        return path
    except ValueError as e:
        logging.error(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        logging.error("No path found between the specified nodes")
        return None


def find_shortest_accessible_path(G, start_lon, start_lat, end_lon, end_lat):
    try:
        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        end_node = ox.nearest_nodes(G, end_lon, end_lat)

        path = ox.shortest_path(G, start_node, end_node, weight='gain')
        return path
    except ValueError as e:
        logging.error(f"Invalid coordinate value: {e}")
        return None
    except nx.NetworkXNoPath:
        logging.error("No path found between the specified nodes")
        return None


@app.route('/')
def home():  # put application's code here
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    # logging.info(f"User ID: {session['user_id']}")
    return render_template('index.html')


@app.route('/shortest-path', methods=['POST'])
def shortest_path():
    data = request.json
    start_lat = float(data['start_lat'])
    start_lon = float(data['start_lon'])
    end_lat = float(data['end_lat'])
    end_lon = float(data['end_lon'])
    accessibility = data['accessibility']

    logging.debug(f"Received data: {start_lat}, {start_lon}, {end_lat}, {end_lon}, accessibility: {accessibility}")

    nodes, edges = fetch_data()
    G = create_graph(nodes, edges)
    if accessibility:
        path = find_shortest_accessible_path(G, start_lon, start_lat, end_lon, end_lat)
    else:
        path = find_shortest_path(G, start_lon, start_lat, end_lon, end_lat)

    if path is None:
        return jsonify({'error': 'No path found'}), 404

    # Convert path to list of nodes with lat and lon properties
    path_coords = [{'lat': G.nodes[node]['y'], 'lon': G.nodes[node]['x']} for node in path]

    return jsonify({'path': path_coords})


@app.route('/save-location', methods=['POST'])
def save_location():
    data = request.json
    user_id = session['user_id']
    lat = data['lat']
    lon = data['lon']

    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}", echo=True)
    point = Point(lon, lat)
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO gta_p1.user_trajectories (user_id, geom) VALUES (:user_id, ST_GeomFromText(:geom, 4326))"),
            {"user_id": str(user_id), "geom": point.wkt}
        )

    print(f"Location saved for user_id: {user_id}, {point.wkt}.")
    return jsonify({'status': 'success'})


if __name__ == '__main__':
    app.run()
