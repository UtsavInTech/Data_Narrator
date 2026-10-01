"""Find how tables connect (shared keys) and build joined 'models'.

A column pair links two tables when their names match after normalising
("Order ID" == "order_id" == "OrderID"), and the values on the many side are
mostly found on the one side, where the key is unique.
"""
import re

from ..db import parquet, q


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def detect(con, tables: list[dict]) -> list[dict]:
    """tables: [{id, name, path, profile}] -> [{many, one, many_col, one_col, coverage}]"""
    links = []
    for a in tables:
        for b in tables:
            if a["id"] == b["id"]:
                continue
            for ca in a["profile"]["columns"]:
                if ca["role"] not in ("id", "entity", "dimension"):
                    continue
                for cb in b["profile"]["columns"]:
                    if _norm(ca["name"]) != _norm(cb["name"]) or cb["role"] not in ("id", "entity", "dimension"):
                        continue
                    ra, rb = parquet(a["path"]), parquet(b["path"])
                    rows_b, n_b, u_b = con.execute(
                        f"SELECT count(*), count({q(cb['name'])}), count(DISTINCT {q(cb['name'])}) FROM {rb}").fetchone()
                    # b must be the unique ("one") side, and a real key: filled on nearly every row
                    if not n_b or u_b < n_b or n_b < 0.9 * rows_b:
                        continue
                    n_a, u_a = con.execute(f"SELECT count({q(ca['name'])}), count(DISTINCT {q(ca['name'])}) FROM {ra}").fetchone()
                    if u_a == n_a and a["profile"]["row_count"] <= b["profile"]["row_count"]:
                        continue  # 1:1 - only link from the larger table
                    hit = con.execute(
                        f"SELECT avg(CASE WHEN k IN (SELECT CAST({q(cb['name'])} AS VARCHAR) FROM {rb}) THEN 1 ELSE 0 END)"
                        f" FROM (SELECT DISTINCT CAST({q(ca['name'])} AS VARCHAR) AS k FROM {ra}"
                        f" WHERE {q(ca['name'])} IS NOT NULL LIMIT 20000)").fetchone()[0] or 0
                    if hit >= 0.5:
                        links.append({"many": a["id"], "one": b["id"], "many_col": ca["name"],
                                      "one_col": cb["name"], "coverage": round(hit, 3)})
    return links


def model_sql(fact: dict, joins: list[tuple[dict, dict]]) -> tuple[str, list[str]]:
    """-> (SELECT joining dims onto the fact, names of the columns brought in from the dims)."""
    fact_cols = {c["name"].lower() for c in fact["profile"]["columns"]}
    added: list[str] = []
    select = ["f.*"]
    from_ = [f"{parquet(fact['path'])} AS f"]
    for i, (dim, link) in enumerate(joins):
        alias = f"d{i}"
        for c in dim["profile"]["columns"]:
            if c["name"] == link["one_col"]:
                continue
            out_name = c["name"] if c["name"].lower() not in fact_cols else f"{dim['name']} {c['name']}"
            fact_cols.add(out_name.lower())
            added.append(out_name)
            select.append(f"{alias}.{q(c['name'])} AS {q(out_name)}")
        from_.append(f"LEFT JOIN {parquet(dim['path'])} AS {alias}"
                     f" ON CAST(f.{q(link['many_col'])} AS VARCHAR) = CAST({alias}.{q(link['one_col'])} AS VARCHAR)")
    return f"(SELECT {', '.join(select)} FROM {' '.join(from_)})", added
