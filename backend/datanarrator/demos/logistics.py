"""A sample transport company: "Sahyadri Roadlines" (fictional), Pune.

A full-truck-load carrier with its own and attached trucks, moving goods for
manufacturers across Maharashtra, Gujarat and Karnataka. Six months of data,
ending today, as the Excel files its operations desk keeps: Vehicles,
Customers, Trips, Fuel and Freight Bills.

The data has the patterns a real fleet has:

- monsoon (Jul-Aug) slows the ghat and Konkan routes; deliveries run late
- diesel price rises in the last two months
- one truck's mileage (km per litre) has dropped sharply: worth a fuel audit
- one driver's trips are late more often than the rest
- a few customers bring most of the freight; one large customer pays very late
- proof-of-delivery (POD) pending on some trips holds up billing
- data problems: missing odometer readings and a repeated LR number
"""
import datetime as dt
import random

import pandas as pd

COMPANY = "Sahyadri Roadlines"
DAYS = 183
SEED = 23

LANES = [  # from, to, km, monsoon-hit
    ("Pune", "Mumbai (JNPT)", 150, True), ("Pune", "Nashik", 210, False), ("Pune", "Aurangabad", 235, False),
    ("Pune", "Kolhapur", 230, False), ("Pune", "Ahmedabad", 660, False), ("Pune", "Bengaluru", 840, False),
    ("Pune", "Goa", 450, True), ("Pune", "Nagpur", 715, False), ("Chakan", "Surat", 450, False),
    ("Chakan", "Hosur", 920, False), ("Ranjangaon", "Mumbai (Bhiwandi)", 210, True), ("Talegaon", "Ratnagiri", 300, True),
]
TRUCKS = [  # type, capacity tonnes, km per litre
    ("32 ft MXL", 16, 3.6), ("32 ft SXL", 7, 4.4), ("22 ft Open", 9, 4.8), ("20 ft Container", 7, 5.0),
    ("14 ft LCV", 3.5, 7.5),
]
DRIVERS = ["Santosh Jadhav", "Ramesh Yadav", "Baldev Singh", "Mahesh Gaikwad", "Suresh Pawar", "Iqbal Khan",
           "Vijay Shinde", "Dinesh Patil", "Gurmeet Singh", "Anil Bhosale", "Raju Kamble", "Prakash More",
           "Sunil Chavan", "Ajay Thakur", "Mohan Rathod", "Sandeep Kale", "Nitin Salunkhe", "Kailash Meena"]
CUSTOMERS = [  # name, industry
    ("Deccan Auto Components", "Auto parts"), ("Sahyadri Agro Foods", "Food"), ("Indrayani Steel Tubes", "Steel"),
    ("Pawana Polymers", "Plastics"), ("Westline Appliances", "Consumer durables"), ("Bhima Paper Mills", "Paper"),
    ("Kalyani Forge Works", "Auto parts"), ("Shivneri Pharma", "Pharma"), ("Mula Textiles", "Textiles"),
    ("Godavari Beverages", "FMCG"), ("Ghatge Engineering", "Engineering"), ("Raigad Chemicals", "Chemicals"),
    ("Konkan Cashew Exports", "Food"), ("Purandar Packaging", "Packaging"), ("Hinjewadi E-Retail Hub", "E-commerce"),
    ("Chakan Tyres", "Auto parts"), ("Lonavala Glass Works", "Glass"), ("Bhor Cement Products", "Building materials"),
]


def generate(today: dt.date | None = None) -> dict[str, pd.DataFrame]:
    rnd = random.Random(SEED)
    today = today or dt.date.today()
    start = today - dt.timedelta(days=DAYS)

    # ---------------------------------------------------------------- vehicles
    vehicles = []
    for i, driver in enumerate(DRIVERS):
        kind, cap, kmpl = rnd.choices(TRUCKS, weights=[30, 20, 22, 18, 10])[0]
        vehicles.append({
            "Vehicle No": f"MH-12-{rnd.choice('KLMNPQ')}{rnd.choice('TUVWX')}-{rnd.randint(1000, 9999)}",
            "Vehicle Type": kind, "Capacity (T)": cap, "Ownership": "Own" if i < 13 else "Attached",
            "Driver": driver, "Base": rnd.choice(["Pune", "Chakan", "Ranjangaon"]),
            "Model Year": rnd.randint(2016, 2025), "_kmpl": kmpl,
        })
    thirsty = vehicles[4]       # mileage drops: possible fuel pilferage
    slow_driver = DRIVERS[7]

    # ---------------------------------------------------------------- customers
    customers = []
    for i, (name, industry) in enumerate(CUSTOMERS):
        size = rnd.paretovariate(1.2)
        customers.append({"Customer ID": f"CU-{301 + i}", "Customer Name": name, "Industry": industry,
                          "City": rnd.choice(["Pune", "Chakan", "Pimpri", "Ranjangaon", "Talegaon", "Shirwal"]),
                          "Credit Days": rnd.choice([15, 30, 30, 45, 60]), "_size": size,
                          "_late": name == "Westline Appliances" or rnd.random() < 0.1})
    weights = [c["_size"] for c in customers]

    # ---------------------------------------------------------------- trips + fuel
    trips, fuel, bills = [], [], []
    lr, trip_no, bill_no = 41001, 1, 8001
    busy_until = {v["Vehicle No"]: start for v in vehicles}
    odo = {v["Vehicle No"]: rnd.randint(80_000, 420_000) for v in vehicles}
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        diesel = 92.4 + (2.6 if k > DAYS - 60 else 0) + rnd.uniform(-0.3, 0.3)
        for v in vehicles:
            if busy_until[v["Vehicle No"]] > day or rnd.random() < 0.12:
                continue
            c = rnd.choices(customers, weights=weights)[0]
            frm, to, km, ghat = rnd.choice(LANES)
            km = int(km * rnd.uniform(0.97, 1.06))
            weight = round(v["Capacity (T)"] * rnd.uniform(0.6, 1.0), 1)
            freight = round(km * (38 + v["Capacity (T)"] * 2.6) * rnd.uniform(0.92, 1.1) / 100) * 100
            plan_days = max(1, round(km / 400))
            late = 0
            if ghat and day.month in (7, 8):
                late += rnd.choice([0, 1, 1, 2])
            if v["Driver"] == slow_driver and rnd.random() < 0.45:
                late += rnd.choice([1, 1, 2])
            elif rnd.random() < 0.08:
                late += 1
            back = plan_days * 2 + late
            delivered = day + dt.timedelta(days=plan_days + late)
            in_transit = delivered > today
            pod = not in_transit and (rnd.random() > 0.06 or (today - delivered).days > 20)
            busy_until[v["Vehicle No"]] = day + dt.timedelta(days=back)
            trips.append({
                "Trip ID": f"T-{trip_no:05d}", "LR No": f"LR-{lr}", "Dispatch Date": day, "Vehicle No": v["Vehicle No"],
                "Driver": v["Driver"], "Customer ID": c["Customer ID"], "From": frm, "To": to, "Distance (km)": km,
                "Weight (T)": weight, "Freight": freight, "Planned Delivery": day + dt.timedelta(days=plan_days),
                "Delivered On": None if in_transit else delivered, "Delay (days)": None if in_transit else late,
                "Trip Status": "In transit" if in_transit else "Delivered", "POD Received": "Yes" if pod else "No",
            })

            # Fuel: filled at the start of the trip for the round trip.
            kmpl = v["_kmpl"] * rnd.uniform(0.93, 1.05)
            if v is thirsty and k > DAYS - 70:
                kmpl *= 0.74
            litres = round(km * 2 / kmpl, 0)
            odo[v["Vehicle No"]] += km * 2
            fuel.append({"Fill Date": day, "Vehicle No": v["Vehicle No"], "Driver": v["Driver"], "Litres": litres,
                         "Rate": round(diesel, 2), "Fuel Amount": round(litres * diesel, 2),
                         "Odometer": odo[v["Vehicle No"]],
                         "Pump": rnd.choice(["HP Chakan", "IOCL Khed Shivapur", "BPCL Talegaon", "HP Wagholi"])})

            # Freight bill, raised once the POD is in.
            if pod:
                bill_day = delivered + dt.timedelta(days=rnd.randint(1, 4))
                if bill_day <= today:
                    due = bill_day + dt.timedelta(days=c["Credit Days"])
                    age = (today - bill_day).days
                    delay = c["Credit Days"] + (rnd.randint(30, 95) if c["_late"] else rnd.randint(-4, 8))
                    paid_share = (1.0 if not c["_late"] or rnd.random() < 0.6 else 0.5) if age >= delay else 0.0
                    total = round(freight * 1.12, 2)  # GST on GTA at 12%
                    bills.append({"Bill No": f"SRL/{bill_no}", "Bill Date": bill_day, "Customer ID": c["Customer ID"],
                                  "Trip ID": f"T-{trip_no:05d}", "Freight": freight, "GST": round(freight * 0.12, 2),
                                  "Bill Amount": total, "Due Date": due, "Amount Received": round(total * paid_share, 2),
                                  "Payment Status": "Paid" if paid_share == 1 else "Part paid" if paid_share else "Unpaid"})
                    bill_no += 1
            lr += 1
            trip_no += 1

    for row in rnd.sample(fuel, 5):
        row["Odometer"] = None
    dup = dict(rnd.choice(trips[:-40]))
    dup["Trip ID"] = f"T-{trip_no:05d}"
    trips.insert(trips.index(next(t for t in trips if t["LR No"] == dup["LR No"])) + 1, dup)
    bills.sort(key=lambda b: b["Bill Date"])

    return {
        "Vehicles": pd.DataFrame(vehicles).drop(columns=["_kmpl"]),
        "Customers": pd.DataFrame(customers).drop(columns=["_size", "_late"]),
        "Trips": pd.DataFrame(trips),
        "Fuel": pd.DataFrame(fuel),
        "Freight Bills": pd.DataFrame(bills),
    }
