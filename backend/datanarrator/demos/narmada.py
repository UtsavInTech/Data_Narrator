"""A realistic sample company to try Data Narrator with.

"Narmada Electricals" (fictional) distributes electrical goods to shops and
contractors around Pune. Six months of data, ending today, written as the
Excel files such a company keeps: Customers, Products, Invoices, Invoice
Lines and Payments. The data has the patterns a real business has:

- no billing on Sundays, a festive rush (Ganesh / Navratri), fans selling in summer
- a few big customers bring in most of the revenue
- most invoices are paid within 30 days; a handful of customers pay late
- one salesperson's sales are slipping over the last two months
- Nashik is shrinking, Kolhapur is growing
- a few real-world data problems: missing GST on some invoices, a repeated invoice number
"""
import datetime as dt
import random

import pandas as pd

COMPANY = "Narmada Electricals"
DAYS = 183
SEED = 7

CITIES = {  # city: (areas, weight, monthly growth)
    "Pune": (["Laxmi Road", "Hadapsar", "Kothrud", "Wakad", "Kharadi"], 0.38, 0.00),
    "Pimpri-Chinchwad": (["Bhosari", "Chinchwad", "Akurdi"], 0.20, 0.01),
    "Nashik": (["College Road", "Panchavati", "Satpur"], 0.14, -0.06),
    "Kolhapur": (["Rajarampuri", "Shahupuri"], 0.10, 0.07),
    "Satara": (["Powai Naka", "Karad Road"], 0.09, 0.00),
    "Ahmednagar": (["Savedi", "Market Yard"], 0.09, 0.00),
}
SALES = ["Amit Patil", "Sneha Kulkarni", "Rahul Deshmukh", "Priya Joshi", "Vikas Pawar"]
SHOP_WORDS = ["Electricals", "Hardware", "Traders", "Lighting House", "Electric Stores", "Enterprises", "Agencies"]
NAMES = ["Shree Ganesh", "Om Sai", "Mahalaxmi", "Jai Bhavani", "Shivam", "Siddhivinayak", "Morya", "Krishna",
         "Gurukrupa", "Navkar", "Balaji", "Mauli", "Samarth", "Vighnaharta", "Ekdant", "Tulja", "Swami",
         "Prakash", "Deep", "Jyoti", "Ambika", "Renuka", "Pratik", "Kalpataru", "Vishwas", "Sahyadri",
         "Pawan", "Mangal", "Saraswati", "Datta"]
PRODUCTS = [  # SKU, product, category, brand, price, reorder level
    ("LT-101", "LED Bulb 9W", "Lighting", "Brightline", 95, 400),
    ("LT-102", "LED Bulb 12W", "Lighting", "Brightline", 130, 300),
    ("LT-110", "LED Tube Light 20W", "Lighting", "Brightline", 320, 150),
    ("LT-120", "LED Panel Light 15W", "Lighting", "HomeGlow", 540, 80),
    ("LT-130", "Decorative String Light 10m", "Lighting", "HomeGlow", 260, 200),
    ("FN-201", "Ceiling Fan 1200mm", "Fans", "AeroBreeze", 2150, 40),
    ("FN-202", "Ceiling Fan BLDC 1200mm", "Fans", "AeroBreeze", 3650, 20),
    ("FN-210", "Exhaust Fan 150mm", "Fans", "AeroBreeze", 980, 30),
    ("FN-220", "Pedestal Fan 400mm", "Fans", "AeroBreeze", 2650, 25),
    ("SG-301", "MCB 32A Single Pole", "Switchgear", "SafeTrip", 210, 250),
    ("SG-302", "MCB 63A Double Pole", "Switchgear", "SafeTrip", 690, 100),
    ("SG-310", "RCCB 40A 30mA", "Switchgear", "SafeTrip", 2450, 30),
    ("SG-320", "Distribution Board 8-way", "Switchgear", "SafeTrip", 1350, 40),
    ("WR-401", "Copper Wire 1.5 sq mm (90 m)", "Wires & Cables", "CopperMax", 1590, 60),
    ("WR-402", "Copper Wire 2.5 sq mm (90 m)", "Wires & Cables", "CopperMax", 2480, 50),
    ("WR-410", "PVC Conduit Pipe 25mm (3 m)", "Wires & Cables", "CopperMax", 68, 500),
    ("AC-501", "Modular Switch 6A", "Accessories", "HomeGlow", 48, 800),
    ("AC-502", "Modular Socket 16A", "Accessories", "HomeGlow", 135, 400),
    ("AC-510", "Extension Board 4-socket", "Accessories", "HomeGlow", 420, 120),
    ("AP-601", "Water Heater 15L", "Appliances", "Volta", 6900, 10),
    ("AP-602", "Instant Geyser 3L", "Appliances", "Volta", 3200, 15),
    ("AP-610", "Mixer Grinder 750W", "Appliances", "Volta", 3450, 15),
]
SEASON = {  # category: function(day) -> multiplier
    "Fans": lambda d: 1.8 if d.month in (4, 5) else 0.6 if d.month in (7, 8, 9) else 1.0,
    "Lighting": lambda d: 1.6 if _festive(d) else 1.0,
    "Appliances": lambda d: 1.4 if d.month in (10, 11, 12, 1) else 0.9,
}


def _festive(d: dt.date) -> bool:
    return (d.month == 9 and d.day <= 20) or (d.month == 10 and d.day >= 8) or (d.month == 11 and d.day <= 10)


def generate(today: dt.date | None = None) -> dict[str, pd.DataFrame]:
    rnd = random.Random(SEED)
    today = today or dt.date.today()
    start = today - dt.timedelta(days=DAYS)

    # ---------------------------------------------------------------- customers
    customers, used = [], set()
    for i in range(90):
        city = rnd.choices(list(CITIES), weights=[v[1] for v in CITIES.values()])[0]
        while True:
            name = f"{rnd.choice(NAMES)} {rnd.choice(SHOP_WORDS)}"
            if name not in used:
                used.add(name)
                break
        ctype = rnd.choices(["Retailer", "Electrical Contractor", "Builder"], weights=[70, 22, 8])[0]
        size = rnd.paretovariate(1.3)  # a few customers are much bigger than the rest
        customers.append({
            "Customer ID": f"C-{1001 + i}", "Customer Name": name, "Customer Type": ctype, "City": city,
            "Area": rnd.choice(CITIES[city][0]),
            "Address": f"Shop {rnd.randint(1, 60)}, {rnd.choice(CITIES[city][0])}, {city}",
            "Salesperson": rnd.choice(SALES),
            "Credit Limit": int(min(size, 12) * 50_000 // 10_000 * 10_000 + 50_000),
            "Customer Since": start - dt.timedelta(days=rnd.randint(30, 2500)),
            "_size": size, "_late": rnd.random() < 0.12,
        })
    weights = [c["_size"] * (3 if c["Customer Type"] == "Builder" else 1.4 if c["Customer Type"] == "Electrical Contractor" else 1)
               for c in customers]

    # ---------------------------------------------------------------- invoices + lines
    invoices, lines = [], []
    inv_no = 26001
    for k in range(DAYS + 1):
        day = start + dt.timedelta(days=k)
        if day.weekday() == 6:  # closed on Sundays
            continue
        base = 15 * (1.25 if _festive(day) else 1) * (0.8 if day.weekday() == 5 else 1)
        for _ in range(max(0, int(rnd.gauss(base, 3)))):
            c = rnd.choices(customers, weights=weights)[0]
            months_in = k / 30
            growth = CITIES[c["City"]][2]
            if rnd.random() > (1 + growth) ** months_in / (1 + max(growth, 0)) ** (DAYS / 30):
                continue
            seller = c["Salesperson"]
            if seller == "Rahul Deshmukh" and k > DAYS - 60 and rnd.random() < 0.45:
                continue  # slipping over the last two months
            n_items = rnd.choices([1, 2, 3, 4, 5, 6], weights=[20, 28, 24, 14, 9, 5])[0]
            taxable = 0.0
            inv = f"INV-{inv_no}"
            for p in rnd.sample(PRODUCTS, n_items):
                sku, prod, cat, brand, price, _ = p
                mult = SEASON.get(cat, lambda d: 1.0)(day)
                qty = max(1, int(rnd.expovariate(1 / (6 * mult * (2.5 if c["Customer Type"] != "Retailer" else 1))) + 1))
                disc = rnd.choice([0, 0, 0, 2, 5, 8]) if qty > 5 else 0
                amount = round(qty * price * (1 - disc / 100), 2)
                taxable += amount
                lines.append({"Invoice No": inv, "SKU": sku, "Qty": qty, "Rate": price, "Discount %": disc,
                              "Line Amount": amount})
            gst = round(taxable * 0.18, 2)
            total = round(taxable + gst, 2)
            due = day + dt.timedelta(days=30)
            age = (today - day).days
            # When this customer would pay; an invoice is only paid once that day has come.
            delay = rnd.randint(60, 200) if c["_late"] else int(rnd.triangular(3, 45, 20))
            if age >= delay:
                paid_share = 1.0 if not c["_late"] or rnd.random() < 0.6 else 0.5
            else:
                paid_share = 0.5 if age >= delay // 2 and rnd.random() < 0.06 else 0.0
            paid = round(total * paid_share, 2)
            status = "Paid" if paid_share == 1 else "Part paid" if paid_share > 0 else "Unpaid"
            invoices.append({"Invoice No": inv, "Invoice Date": day, "Customer ID": c["Customer ID"], "Salesperson": seller,
                             "Items": n_items, "Taxable Value": round(taxable, 2), "GST": gst, "Invoice Total": total,
                             "Payment Status": status, "Due Date": due, "Amount Paid": paid, "_paid_on": day + dt.timedelta(
                                 days=delay if paid_share == 1 else max(1, delay // 2))})
            inv_no += 1

    # Real-world data problems.
    for row in rnd.sample(invoices, 4):
        row["GST"] = None
    dup = dict(rnd.choice(invoices[:-50]))
    invoices.insert(invoices.index(next(r for r in invoices if r["Invoice No"] == dup["Invoice No"])) + 1, dup)

    # ---------------------------------------------------------------- payments
    payments, rc = [], 9001
    for inv in invoices:
        if inv["Amount Paid"] and inv["Amount Paid"] > 0:
            when = min(inv["_paid_on"], today)
            payments.append({"Receipt No": f"RCPT-{rc}", "Receipt Date": when, "Customer ID": inv["Customer ID"],
                             "Invoice No": inv["Invoice No"], "Amount Received": inv["Amount Paid"],
                             "Mode": rnd.choices(["UPI", "NEFT", "Cheque", "Cash"], weights=[42, 30, 18, 10])[0]})
            rc += 1
    payments.sort(key=lambda p: p["Receipt Date"])

    sold = pd.DataFrame(lines).groupby("SKU")["Qty"].sum()
    products = [{"SKU": s, "Product": n, "Category": c, "Brand": b, "Unit Price": p, "Reorder Level": r,
                 "Stock on Hand": max(0, int(r * rnd.uniform(0.3, 3.0)) - (5 if sold.get(s, 0) > 600 else 0))}
                for s, n, c, b, p, r in PRODUCTS]

    return {
        "Customers": pd.DataFrame(customers).drop(columns=["_size", "_late"]),
        "Products": pd.DataFrame(products),
        "Invoices": pd.DataFrame(invoices).drop(columns=["_paid_on"]),
        "Invoice Lines": pd.DataFrame(lines),
        "Payments": pd.DataFrame(payments),
    }


