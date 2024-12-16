import osmnx as ox
import networkx as nx


def create_graph():
    G = ox.graph_from_place('Zurich, Switzerland', network_type='walk')
    G = ox.add_node_elevations_raster(G, './rasterdata/raster.tif')

def remove_steep_edges(G: nx.MultiDiGraph, slope_threshold: float) -> nx.MultiDiGraph:
    """
    Remove edges with an average slope above a certain threshold and delete isolated nodes.

    Parameters:
    G (nx.MultiDiGraph): The input graph.
    slope_threshold (float): The slope threshold above which edges will be removed.

    Returns:
    nx.MultiDiGraph: The graph with steep edges and isolated nodes removed.
    """

    G_copy = G.copy()

    edges_to_remove = []

    for u, v, data in G_copy.edges(data=True):
        elevation_u = G_copy.nodes[u].get('elevation', 0)
        elevation_v = G_copy.nodes[v].get('elevation', 0)
        length = data['length']
        slope = abs(elevation_v - elevation_u) / length

        if slope > slope_threshold:
            edges_to_remove.append((u, v))

    G_copy.remove_edges_from(edges_to_remove)

    isolated_nodes = [node for node, degree in G_copy.degree() if degree == 0]
    G_copy.remove_nodes_from(isolated_nodes)

    return G_copy

if __name__ == '__main__':
    print('0')