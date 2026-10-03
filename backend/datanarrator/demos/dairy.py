"""A sample dairy: "Bhavani Valley Dairy" (fictional), Erode, Tamil Nadu.

It buys milk straight from farmers at village collection centres twice a day,
turns it into paneer, curd, cheese, ghee, butter and yogurt at one plant, and
sells through distributors across South India on its own cold chain. Six
months of data, ending today, as the Excel files its MIS desk keeps:
Distributors, Products, Milk Collection, Production, Invoices, Invoice Lines
and Returns.

The data has the patterns a real dairy has:

- summer (Apr-Jun) is the lean season: less milk, but curd and buttermilk sell more
- the festive season (Sep-Nov) lifts ghee, paneer and sweets demand
- Bengaluru is the fastest-growing market; Madurai is slipping
- one collection centre's fat % is falling and rejections are rising (worth checking)
- one distributor's returns are climbing (cold chain trouble)
- Line 2's paneer yield is drifting down
- modern-trade chains pay late
- data problems: a few collections with no fat % and a repeated invoice number
"""
import datetime as dt
import random

import pandas as pd

COMPANY = "Bhavani Valley Dairy"
DAYS = 183
SEED = 11

MARKETS = {  # city: (state, routes, weight, monthly growth)
    "Erode": ("Tamil Nadu", ["Perundurai Road", "Bhavani", "Gobi"], 0.16, 0.00),
    "Coimbatore": ("Tamil Nadu", ["Gandhipuram", "RS Puram", "Peelamedu", "Saravanampatti"], 0.22, 0.01),
    "Salem": ("Tamil Nadu", ["Fairlands", "Hasthampatti"], 0.10, 0.00),
    "Chennai": ("Tamil Nadu", ["Anna Nagar", "T Nagar", "Velachery", "Tambaram"], 0.20, 0.01),
    "Madurai": ("Tamil Nadu", ["Anna Nagar", "KK Nagar"], 0.09, -0.05),
    "Bengaluru": ("Karnataka", ["Whitefield", "Jayanagar", "HSR Layout", "Yelahanka"], 0.15, 0.08),
    "Kochi": ("Kerala", ["Edappally", "Kakkanad"], 0.08, 0.02),
}
OFFICERS = ["Senthil Murugan", "Divya Ramesh", "Arun Prakash", "Kavitha Selvam", "Manoj Nair"]
SHOP_WORDS = ["Agencies", "Dairy Distributors", "Enterprises", "Traders", "Cold Stores", "Food Products", "Marketing"]
NAMES = ["Sri Murugan", "Annapoorna", "Sakthi", "Lakshmi", "Velan", "Kongu", "Sri Balaji", "Thangam", "Amman",
         "Selvi", "Ponni", "Vetri", "Kaveri", "Nandhini", "Sri Vinayaga", "Gokul", "Arasan", "Malar", "Sivasakthi",
         "Bharathi", "Kumaran", "Anbu", "Mahalakshmi", "Saravana", "Nilgiri", "Cauvery", "Om Sakthi", "Sri Krishna"]
CHAINS = ["FreshMart Superstores", "DailyBasket Retail", "Metro Hypermarket", "Nilgiris Express"]

PRODUCTS = [  # SKU, product, category, pack, distributor price, MRP, shelf life days, GST %
    ("PN-200", "Fresh Paneer 200 g", "Paneer", "200 g", 88, 105, 30, 5),
    ("PN-500", "Fresh Paneer 500 g", "Paneer", "500 g", 205, 245, 30, 5),
    ("PN-1K", "Malai Paneer 1 kg (HoReCa)", "Paneer", "1 kg", 385, 450, 30, 5),
    ("CD-400", "Set Curd 400 g", "Curd", "400 g", 32, 40, 12, 0),
    ("CD-1K", "Thick Curd 1 kg Tub", "Curd", "1 kg", 72, 88, 12, 0),
    ("BM-200", "Spiced Buttermilk 200 ml", "Curd", "200 ml", 10, 15, 10, 0),
    ("CH-SL", "Cheese Slices 200 g", "Cheese", "200 g", 112, 135, 180, 12),
    ("CH-MZ", "Mozzarella Block 1 kg", "Cheese", "1 kg", 420, 495, 120, 12),
    ("CH-CR", "Cream Cheese 180 g", "Cheese", "180 g", 115, 140, 90, 12),
    ("GH-500", "Cow Ghee 500 ml", "Ghee", "500 ml", 330, 385, 270, 12),
    ("GH-1L", "Cow Ghee 1 L Jar", "Ghee", "1 L", 640, 750, 270, 12),
    ("BT-100", "Table Butter 100 g", "Butter", "100 g", 52, 62, 180, 12),
    ("BT-500", "Table Butter 500 g", "Butter", "500 g", 245, 290, 180, 12),
    ("YG-GR", "Greek Yogurt 100 g", "Yogurt", "100 g", 34, 45, 25, 5),
    ("YG-MG", "Mango Yogurt 100 g", "Yogurt", "100 g", 26, 35, 25, 5),
    ("CR-200", "Fresh Cream 200 ml", "Cream", "200 ml", 58, 70, 20, 5),
    ("KH-500", "Khoa 500 g", "Sweets", "500 g", 185, 220, 15, 5),
]
SEASON = {  # category: function(day) -> demand multiplier
    "Curd": lambda d: 1.5 if d.month in (4, 5, 6) else 0.95,
    "Yogurt": lambda d: 1.3 if d.month in (4, 5, 6) else 1.0,
    "Ghee": lambda d: 1.7 if _festive(d) else 1.0,
    "Sweets": lambda d: 2.2 if _festive(d) else 0.8,
    "Paneer": lambda d: 1.25 if _festive(d) else 1.0,
}
CENTRES = [  # centre, district
    ("Kodumudi", "Erode"), ("Chennimalai", "Erode"), ("Sathyamangalam", "Erode"), ("Anthiyur", "Erode"),
    ("Kangayam", "Tiruppur"), ("Dharapuram", "Tiruppur"), ("Palladam", "Tiruppur"), ("Avinashi", "Tiruppur"),
    ("Mettupalayam", "Coimbatore"), ("Pollachi", "Coimbatore"), ("Annur", "Coimbatore"),
    ("Namakkal", "Namakkal"), ("Tiruchengode", "Namakkal"), ("Rasipuram", "Namakkal"),
    ("Mettur", "Salem"), ("Omalur", "Salem"), ("Karur", "Karur"), ("Hosur", "Krishnagiri"),
]
LINES = {"Paneer": "Line 1", "Cheese": "Line 3", "Curd": "Line 4", "Yogurt": "Line 4",
         "Ghee": "Line 5", "Butter": "Line 5", "Cream": "Line 5", "Sweets": "Line 6"}
# Litres of milk per kg of product, roughly.
MILK_PER_KG = {"Paneer": 5.6, "Cheese": 9.5, "Curd": 1.05, "Yogurt": 1.15, "Ghee": 22.0, "Butter": 20.0,
               "Cream": 9.0, "Sweets": 4.2}
SUPERVISORS = ["R. Gopal", "S. Meena", "K. Ravi", "P. Anitha"]


def _festive(d: dt.date) -> bool:
    return (d.month == 9 and d.day >= 10) or d.month == 10 or (d.month == 11 and d.day <= 15)


def _lean(d: dt.date) -> float:
    """Milk supply: lower in summer, back up after the monsoon starts."""
    return {4: 0.88, 5: 0.82, 6: 0.86, 7: 0.95}.get(d.month, 1.0)


def generate(today: dt.date | None = None) -> dict[str, pd.DataFrame]:
    rnd = random.Random(SEED)
    today = today or dt.date.today()
    start = today - dt.timedelta(days=DAYS)

    # ---------------------------------------------------------------- distributors
    distributors, used = [], set()
    for i in range(70):
        city = rnd.choices(list(MARKETS), weights=[v[2] for v in MARKETS.values()])[0]
        channel = rnd.choices(["General Trade", "Modern Trade", "HoReCa", "Parlour"], weights=[64, 10, 18, 8])[0]
        if channel == "Modern Trade":
            name = f"{rnd.choice(CHAINS)} - {city}"
        else:
            while True:
                name = f"{rnd.choice(NAMES)} {rnd.choice(SHOP_WORDS)}"
                if name not in used:
                    break
        if name in used:
            continue
        used.add(name)
        size = rnd.paretovariate(1.4) * (2.5 if channel == "Modern Trade" else 1)
        distributors.append({
            "Distributor ID": f"D-{2001 + i}", "Distributor Name": name, "Channel": channel, "City": city,
            "State": MARKETS[city][0], "Route": rnd.choice(MARKETS[city][1]), "Sales Officer": rnd.choice(OFFICERS),
            "Credit Days": 45 if channel == "Modern Trade" else rnd.choice([7, 15, 15, 21]),
            "Credit Limit": int(min(size, 10) * 100_000 // 25_000 * 25_000 + 100_000),
            "Distributor Since": start - dt.timedelta(days=rnd.randint(60, 3000)),
            "_size": size, "_late": channel == "Modern Trade" or rnd.random() < 0.08,
        })
    weights = [d["_size"] for d in distributors]
    leaky = next(d for d in distributors if d["City"] == "Chennai" and d["Channel"] == "General Trade")

    # ---------------------------------------------------------------- milk collection
    collections = []
    weak_centre = "Kodumudi"
    centres = [(c, d, rnd.randint(110, 330)) for c, d in CENTRES]
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        for shift in ("Morning", "Evening"):
            for name, district, farmers in centres:
                base = farmers * (6.2 if shift == "Morning" else 4.8) * _lean(day)
                litres = max(0, round(rnd.gauss(base, base * 0.06), 1))
                fat = rnd.gauss(4.3 if shift == "Evening" else 4.1, 0.18)
                snf = rnd.gauss(8.5, 0.12)
                rejected = round(litres * max(0, rnd.gauss(0.004, 0.003)), 1)
                if name == weak_centre and k > DAYS - 75:  # quality slipping: possible watering
                    drift = (k - (DAYS - 75)) / 75
                    fat -= 0.55 * drift
                    snf -= 0.35 * drift
                    rejected = round(litres * (0.01 + 0.05 * drift * rnd.random()), 1)
                fat, snf = round(fat, 1), round(snf, 1)
                rate = round(33.0 + (fat - 4.0) * 3.2 + (snf - 8.5) * 2.0, 2)
                accepted = litres - rejected
                collections.append({
                    "Collection Date": day, "Shift": shift, "Centre": name, "District": district,
                    "Farmers Poured": int(farmers * rnd.uniform(0.86, 0.97)), "Litres": litres,
                    "Rejected Litres": rejected, "Fat %": fat, "SNF %": snf, "Rate per Litre": rate,
                    "Amount Payable": round(accepted * rate, 2),
                })
    for row in rnd.sample(collections, 6):
        row["Fat %"] = None

    # ---------------------------------------------------------------- invoices + lines
    vans = [f"TN-{rnd.choice(['33', '36', '38'])}-{rnd.choice('ABCDE')}{rnd.choice('KLMN')}-{rnd.randint(1000, 9999)}"
            for _ in range(26)]  # refrigerated vans, each on its own routes
    van_for = {(city, route): rnd.choice(vans) for city, v in MARKETS.items() for route in v[1]}
    invoices, lines, demand = [], [], {}
    inv_no = 50001
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        base = 34 * (1.15 if _festive(day) else 1)
        for _ in range(max(0, int(rnd.gauss(base, 4)))):
            d = rnd.choices(distributors, weights=weights)[0]
            growth = MARKETS[d["City"]][3]
            if rnd.random() > (1 + growth) ** (k / 30) / (1 + max(growth, 0)) ** (DAYS / 30):
                continue
            n_items = rnd.choices([2, 3, 4, 5, 6, 7], weights=[12, 20, 24, 20, 14, 10])[0]
            taxable = gst = 0.0
            inv = f"BVD-{inv_no}"
            for p in rnd.sample(PRODUCTS, n_items):
                sku, prod, cat, pack, price, mrp, life, tax = p
                if d["Channel"] == "HoReCa" and cat in ("Yogurt", "Sweets"):
                    continue
                mult = SEASON.get(cat, lambda x: 1.0)(day)
                qty = max(6, int(rnd.expovariate(1 / (40 * mult * (3 if d["Channel"] == "Modern Trade" else 1)))) // 6 * 6 + 6)
                amount = round(qty * price, 2)
                taxable += amount
                gst += amount * tax / 100
                demand[(day, cat)] = demand.get((day, cat), 0) + qty * _kg(pack)
                lines.append({"Invoice No": inv, "SKU": sku, "Qty": qty, "Rate": price, "GST %": tax,
                              "Line Amount": amount})
            if not taxable:
                continue
            total = round(taxable + gst, 2)
            due = day + dt.timedelta(days=d["Credit Days"])
            age = (today - day).days
            delay = d["Credit Days"] + (rnd.randint(25, 80) if d["_late"] else rnd.randint(-5, 6))
            if age >= delay:
                paid_share = 1.0 if not d["_late"] or rnd.random() < 0.7 else 0.5
            else:
                paid_share = 0.0
            paid = round(total * paid_share, 2)
            invoices.append({"Invoice No": inv, "Invoice Date": day, "Distributor ID": d["Distributor ID"],
                             "Sales Officer": d["Sales Officer"], "Vehicle": van_for[(d["City"], d["Route"])],
                             "Items": n_items, "Taxable Value": round(taxable, 2), "GST": round(gst, 2),
                             "Invoice Total": total, "Payment Status": "Paid" if paid_share == 1 else "Part paid" if paid else "Unpaid",
                             "Due Date": due, "Amount Paid": paid})
            inv_no += 1
    dup = dict(rnd.choice(invoices[:-80]))
    invoices.insert(invoices.index(next(r for r in invoices if r["Invoice No"] == dup["Invoice No"])) + 1, dup)

    # ---------------------------------------------------------------- production
    production, batch = [], 7001
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        for cat, line in LINES.items():
            need = demand.get((day, cat), 0) * rnd.uniform(1.0, 1.08)
            if need <= 0:
                continue
            shifts = 2 if need > 900 else 1
            for s in range(shifts):
                out = round(need / shifts, 1)
                ideal = MILK_PER_KG[cat]
                yield_loss = 0.0
                if cat == "Paneer" and k > DAYS - 50:  # Line 1 drifting
                    yield_loss = 0.07 * (k - (DAYS - 50)) / 50
                milk = round(out * ideal * (1 + yield_loss) * rnd.uniform(0.98, 1.03), 0)
                production.append({
                    "Production Date": day, "Batch No": f"B-{batch}", "Line": line, "Category": cat,
                    "Shift": "Day" if s == 0 else "Night", "Milk Used (L)": milk, "Output (kg)": out,
                    "Wastage (kg)": round(out * rnd.uniform(0.004, 0.018), 1),
                    "Supervisor": rnd.choice(SUPERVISORS),
                })
                batch += 1

    # ---------------------------------------------------------------- returns
    returns, rn = [], 3001
    chilled = [p for p in PRODUCTS if p[6] <= 30]
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        for _ in range(rnd.randint(1, 4)):
            d = rnd.choices(distributors, weights=weights)[0]
            p = rnd.choice(chilled)
            reason = rnd.choices(["Near expiry", "Damaged pack", "Leakage", "Cold chain break"], weights=[50, 25, 17, 8])[0]
            qty = rnd.randint(6, 48)
            returns.append({"Return No": f"RT-{rn}", "Return Date": day, "Distributor ID": d["Distributor ID"],
                            "SKU": p[0], "Qty": qty, "Reason": reason, "Credit Value": qty * p[4]})
            rn += 1
        if k > DAYS - 45 and rnd.random() < 0.7:  # one distributor's cold chain is failing
            p = rnd.choice(chilled)
            qty = rnd.randint(24, 120)
            returns.append({"Return No": f"RT-{rn}", "Return Date": day, "Distributor ID": leaky["Distributor ID"],
                            "SKU": p[0], "Qty": qty, "Reason": "Cold chain break", "Credit Value": qty * p[4]})
            rn += 1

    products = [{"SKU": s, "Product": n, "Category": c, "Pack": pk, "Distributor Price": pr, "MRP": m,
                 "Shelf Life (days)": life, "GST %": tax, "Storage": "Ambient" if c == "Ghee" else "Chilled"}
                for s, n, c, pk, pr, m, life, tax in PRODUCTS]

    return {
        "Distributors": pd.DataFrame(distributors).drop(columns=["_size", "_late"]),
        "Products": pd.DataFrame(products),
        "Milk Collection": pd.DataFrame(collections),
        "Production": pd.DataFrame(production),
        "Invoices": pd.DataFrame(invoices),
        "Invoice Lines": pd.DataFrame(lines),
        "Returns": pd.DataFrame(returns),
    }


def _kg(pack: str) -> float:
    n, unit = pack.split()
    return float(n) / 1000 if unit in ("g", "ml") else float(n)
