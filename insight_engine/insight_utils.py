def generate_basic_insights(df):
    insights = []

    if "Amount" in df.columns:
        total_sales = df["Amount"].sum()
        insights.append(f"Total sales (Amount) = {total_sales:.2f}")

    if "Profit" in df.columns:
        total_profit = df["Profit"].sum()
        insights.append(f"Total profit = {total_profit:.2f}")

    if "Category" in df.columns and "Amount" in df.columns:
        top_cat = df.groupby("Category")["Amount"].sum().idxmax()
        insights.append(f"Top category by sales = {top_cat}")

    if "Category" in df.columns and "Profit" in df.columns:
        low_profit_cat = df.groupby("Category")["Profit"].sum().idxmin()
        insights.append(f"Lowest profit in {low_profit_cat}")

    return insights


def generate_chart_commentary(df):
    commentary = []

    if "Category" in df.columns and "Amount" in df.columns:
        sales_by_cat = df.groupby("Category")["Amount"].sum()
        top_cat = sales_by_cat.idxmax()
        commentary.append(f"As you can see, {top_cat} has the highest sales overall.")

    if "Sub-Category" in df.columns and "Profit" in df.columns:
        profit_by_sub = df.groupby("Sub-Category")["Profit"].sum()
        top_sub = profit_by_sub.idxmax()
        low_sub = profit_by_sub.idxmin()
        commentary.append(
            f"In terms of profit, {top_sub} performs best, "
            f"while {low_sub} shows the lowest profit."
        )

    return commentary