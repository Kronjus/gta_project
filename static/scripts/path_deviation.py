from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import json

load_dotenv(dotenv_path=r"C:\Users\jj\PycharmProjects\gta_project\.env")

print(os.getenv('DB_USER'))

engine = create_engine(
    f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}")

with engine.begin() as conn:
    results = conn.execute(
        text("SELECT ST_AsGeoJSON(avoided_segments) AS avoided_segments FROM gta_p1.avoided_segments"))

data = [json.loads(row[0]) for row in results]
print(type(data[0]))
print(data[0])