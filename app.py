import logging

logging.basicConfig(level=logging.DEBUG)

from flask import Flask, render_template, request, jsonify
import os
from sqlalchemy import create_engine
import geopandas as gpd
import networkx as nx
import osmnx as ox
from dotenv import load_dotenv

app = Flask(__name__)

load_dotenv()


def fetch_data():
    engine = create_engine(
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")

    nodes_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_nodes", engine, geom_col='geometry', index_col='osmid')
    edges_gdf = gpd.read_postgis("SELECT * FROM gta_p1.zurich_edges", engine, geom_col='geometry')

    edges_gdf.set_index(['u', 'v', 'key'], inplace=True)
    print("Retrieving data from database DONE!")
    return nodes_gdf, edges_gdf


def create_graph(nodes, edges):
    G = ox.graph_from_gdfs(nodes, edges)
    print("Building graph DONE!")
    return G


def find_shortest_path(G, start_lon, start_lat, end_lon, end_lat):
    try:
        start_node = ox.nearest_nodes(G, start_lon, start_lat)
        logging.debug(f"Start node: {start_node}")

        end_node = ox.nearest_nodes(G, end_lon, end_lat)
        logging.debug(f"End node: {end_node}")

        path = ox.shortest_path(G, start_node, end_node)
        logging.debug(f"Shortest path: {path}")

        return path
    except nx.NetworkXNoPath:
        return None


@app.route('/')
def home():  # put application's code here
    return render_template('index.html')

@app.route('/shortest-path', methods=['POST'])
def shortest_path():
    data = request.json
    start_lat = data['start_lat']
    start_lon = data['start_lon']
    end_lat = data['end_lat']
    end_lon = data['end_lon']

    logging.debug(f"Received data: {data}")

    nodes, edges = fetch_data()
    G = create_graph(nodes, edges)
    path = find_shortest_path(G, start_lon, start_lat, end_lon, end_lat)

    return jsonify({'path': path})


if __name__ == '__main__':
    app.run(debug=True)
