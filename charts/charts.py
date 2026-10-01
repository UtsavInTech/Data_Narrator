import matplotlib.pyplot as plt
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def plot_sales_by_category(df):
    if "Category" not in df.columns or "Amount" not in df.columns:
        return None

    fig, ax = plt.subplots(figsize=(8, 6))
    sales_by_cat = df.groupby("Category")["Amount"].sum()
    sales_by_cat.plot(kind="bar", ax=ax)
    ax.set_title("Sales (Amount) by Category")
    ax.set_ylabel("Total Amount")
    ax.set_xlabel("Category")

    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    filepath = os.path.join(OUTPUT_DIR, "sales_by_category.png")
    fig.savefig(filepath)
    return filepath


def plot_profit_by_subcategory(df):
    if "Sub-Category" not in df.columns or "Profit" not in df.columns:
        return None

    fig, ax = plt.subplots(figsize=(10, 6))
    profit_by_sub = df.groupby("Sub-Category")["Profit"].sum()
    profit_by_sub.plot(kind="bar", ax=ax)
    ax.set_title("Profit by Sub-Category")
    ax.set_ylabel("Total Profit")
    ax.set_xlabel("Sub-Category")

    plt.xticks(rotation=60, ha="right")
    plt.tight_layout()

    filepath = os.path.join(OUTPUT_DIR, "profit_by_subcategory.png")
    fig.savefig(filepath)
    return filepath