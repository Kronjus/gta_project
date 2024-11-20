import osmnx as ox


def create_graph():
    G = ox.graph_from_place('Zurich, Switzerland', network_type='walk')
    G = ox.add_node_elevations_raster(G, './rasterdata/raster.tif')